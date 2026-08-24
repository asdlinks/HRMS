const { one, many, run, transaction, sql } = require('../db/sql');
const rolesRepo = require('./roles.repository');

const DOCUMENT_COLUMNS = `
    d.id, d.title, d.category, d.description, d.effective_date, d.expiry_date, d.status,
    d.created_by, d.created_at, d.updated_at, d.current_version_id,
    v.version_number, v.original_file_name, v.mime_type, v.size_bytes, v.uploaded_at,
    creator.name AS created_by_name, uploader.name AS uploaded_by_name`;

const DOCUMENT_JOINS = `
    FROM company_documents d
    LEFT JOIN company_document_versions v ON v.id = d.current_version_id
    LEFT JOIN users creator ON creator.id = d.created_by
    LEFT JOIN users uploader ON uploader.id = v.uploaded_by`;

// A document is visible to a user if any of its share rows matches: 'all',
// one of the user's roles (via user_roles), their department, or their
// branch (location). Reused by the employee list, the single-document
// visibility gate (download/preview), and the notification-recipient
// resolver below so the three stay in lock-step.
const VISIBILITY_EXISTS = `
    EXISTS (
        SELECT 1 FROM company_document_shares s
        WHERE s.document_id = d.id
          AND (
              s.share_type = 'all'
              OR (s.share_type = 'role' AND s.role_id IN (SELECT role_id FROM user_roles WHERE user_id = @userId))
              OR (s.share_type = 'department' AND s.department_id = (SELECT department_id FROM users WHERE id = @userId))
              OR (s.share_type = 'branch' AND s.location_id = (SELECT location_id FROM users WHERE id = @userId))
          )
    )`;

// Active/effective/not-yet-expired — compared as DATE vs DATE (not string),
// which sidesteps the known MSSQL DATE-serializes-as-full-ISO-timestamp trap
// entirely on the server side.
const ACTIVE_AND_EFFECTIVE = `
    d.status = 'active'
    AND d.effective_date <= CAST(SYSUTCDATETIME() AS DATE)
    AND (d.expiry_date IS NULL OR d.expiry_date >= CAST(SYSUTCDATETIME() AS DATE))`;

function listForAdmin(tenantId, { status, category, search } = {}) {
    const conditions = ['d.tenant_id = @tenantId'];
    const params = { tenantId: { type: sql.Int, value: tenantId } };

    if (status) {
        conditions.push('d.status = @status');
        params.status = { type: sql.NVarChar(20), value: status };
    }
    if (category) {
        conditions.push('d.category = @category');
        params.category = { type: sql.NVarChar(50), value: category };
    }
    if (search) {
        conditions.push('d.title LIKE @search');
        params.search = { type: sql.NVarChar(255), value: `%${search}%` };
    }

    return many(
        `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_JOINS} WHERE ${conditions.join(' AND ')} ORDER BY d.updated_at DESC`,
        params
    );
}

function listVisibleToUser(tenantId, userId, { category, search } = {}) {
    const conditions = ['d.tenant_id = @tenantId', ACTIVE_AND_EFFECTIVE, VISIBILITY_EXISTS];
    const params = {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
    };

    if (category) {
        conditions.push('d.category = @category');
        params.category = { type: sql.NVarChar(50), value: category };
    }
    if (search) {
        conditions.push('d.title LIKE @search');
        params.search = { type: sql.NVarChar(255), value: `%${search}%` };
    }

    return many(
        `SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_JOINS} WHERE ${conditions.join(' AND ')} ORDER BY d.effective_date DESC`,
        params
    );
}

async function isVisibleToUser(tenantId, documentId, userId) {
    const row = await one(
        `SELECT d.id ${DOCUMENT_JOINS} WHERE d.tenant_id = @tenantId AND d.id = @documentId AND ${ACTIVE_AND_EFFECTIVE} AND ${VISIBILITY_EXISTS}`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            documentId: { type: sql.Int, value: documentId },
            userId: { type: sql.Int, value: userId },
        }
    );
    return !!row;
}

function get(tenantId, id) {
    return one(`SELECT ${DOCUMENT_COLUMNS} ${DOCUMENT_JOINS} WHERE d.tenant_id = @tenantId AND d.id = @id`, {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });
}

function getLatestVersionFile(tenantId, documentId) {
    return one(
        `SELECT v.id, v.original_file_name, v.stored_file_name, v.mime_type, v.size_bytes
         FROM company_documents d JOIN company_document_versions v ON v.id = d.current_version_id
         WHERE d.tenant_id = @tenantId AND d.id = @documentId`,
        { tenantId: { type: sql.Int, value: tenantId }, documentId: { type: sql.Int, value: documentId } }
    );
}

function getVersionFile(tenantId, documentId, versionId) {
    return one(
        `SELECT id, original_file_name, stored_file_name, mime_type, size_bytes
         FROM company_document_versions WHERE tenant_id = @tenantId AND document_id = @documentId AND id = @versionId`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            documentId: { type: sql.Int, value: documentId },
            versionId: { type: sql.Int, value: versionId },
        }
    );
}

// Used by the admin edit dialog to pre-populate the visibility picker —
// employees never see this (only fetched when the caller has
// company-documents.manage, gated in the route).
function getShares(tenantId, documentId) {
    return many(
        `SELECT share_type, role_id, department_id, location_id
         FROM company_document_shares WHERE tenant_id = @tenantId AND document_id = @documentId`,
        { tenantId: { type: sql.Int, value: tenantId }, documentId: { type: sql.Int, value: documentId } }
    );
}

function listVersions(tenantId, documentId) {
    return many(
        `SELECT v.id, v.version_number, v.original_file_name, v.mime_type, v.size_bytes, v.uploaded_at, u.name AS uploaded_by_name
         FROM company_document_versions v JOIN users u ON u.id = v.uploaded_by
         WHERE v.tenant_id = @tenantId AND v.document_id = @documentId
         ORDER BY v.version_number DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, documentId: { type: sql.Int, value: documentId } }
    );
}

async function insertShares(tx, tenantId, documentId, visibility) {
    const rows = [];
    if (visibility.allEmployees) {
        rows.push({ shareType: 'all', roleId: null, departmentId: null, locationId: null });
    } else {
        for (const roleId of visibility.roleIds || []) rows.push({ shareType: 'role', roleId, departmentId: null, locationId: null });
        for (const departmentId of visibility.departmentIds || []) rows.push({ shareType: 'department', roleId: null, departmentId, locationId: null });
        for (const locationId of visibility.locationIds || []) rows.push({ shareType: 'branch', roleId: null, departmentId: null, locationId });
    }
    for (const row of rows) {
        await tx.run(
            `INSERT INTO company_document_shares (tenant_id, document_id, share_type, role_id, department_id, location_id)
             VALUES (@tenantId, @documentId, @shareType, @roleId, @departmentId, @locationId)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                documentId: { type: sql.Int, value: documentId },
                shareType: { type: sql.NVarChar(20), value: row.shareType },
                roleId: { type: sql.Int, value: row.roleId },
                departmentId: { type: sql.Int, value: row.departmentId },
                locationId: { type: sql.Int, value: row.locationId },
            }
        );
    }
}

// Creates the document row, its first version, and its share rows in one
// transaction. `file` is multer's file descriptor (already written to disk
// by the time this runs); `data` is the zod-validated metadata body.
function create(tenantId, data, createdBy, file, storedFileName) {
    return transaction(async (tx) => {
        const docResult = await tx.run(
            `INSERT INTO company_documents (tenant_id, title, category, description, effective_date, expiry_date, created_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @title, @category, @description, @effectiveDate, @expiryDate, @createdBy)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                title: { type: sql.NVarChar(255), value: data.title },
                category: { type: sql.NVarChar(50), value: data.category },
                description: { type: sql.NVarChar(sql.MAX), value: data.description || null },
                effectiveDate: { type: sql.Date, value: data.effective_date },
                expiryDate: { type: sql.Date, value: data.expiry_date || null },
                createdBy: { type: sql.Int, value: createdBy },
            }
        );
        const documentId = docResult.recordset[0].id;

        const versionResult = await tx.run(
            `INSERT INTO company_document_versions (tenant_id, document_id, version_number, original_file_name, stored_file_name, mime_type, size_bytes, uploaded_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @documentId, 1, @originalFileName, @storedFileName, @mimeType, @sizeBytes, @uploadedBy)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                documentId: { type: sql.Int, value: documentId },
                originalFileName: { type: sql.NVarChar(255), value: file.originalname },
                storedFileName: { type: sql.NVarChar(255), value: storedFileName },
                mimeType: { type: sql.NVarChar(100), value: file.mimetype },
                sizeBytes: { type: sql.BigInt, value: file.size },
                uploadedBy: { type: sql.Int, value: createdBy },
            }
        );
        const versionId = versionResult.recordset[0].id;

        await tx.run('UPDATE company_documents SET current_version_id = @versionId WHERE id = @documentId', {
            versionId: { type: sql.Int, value: versionId },
            documentId: { type: sql.Int, value: documentId },
        });

        await insertShares(tx, tenantId, documentId, data.visibility);

        return documentId;
    });
}

function updateMetadata(tenantId, id, data) {
    return transaction(async (tx) => {
        await tx.run(
            `UPDATE company_documents SET title = @title, category = @category, description = @description,
                effective_date = @effectiveDate, expiry_date = @expiryDate, updated_at = SYSUTCDATETIME()
             WHERE tenant_id = @tenantId AND id = @id`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                id: { type: sql.Int, value: id },
                title: { type: sql.NVarChar(255), value: data.title },
                category: { type: sql.NVarChar(50), value: data.category },
                description: { type: sql.NVarChar(sql.MAX), value: data.description || null },
                effectiveDate: { type: sql.Date, value: data.effective_date },
                expiryDate: { type: sql.Date, value: data.expiry_date || null },
            }
        );
        await tx.run('DELETE FROM company_document_shares WHERE document_id = @documentId', {
            documentId: { type: sql.Int, value: id },
        });
        await insertShares(tx, tenantId, id, data.visibility);
    });
}

async function addVersion(tenantId, documentId, file, storedFileName, uploadedBy) {
    return transaction(async (tx) => {
        const last = await tx.one(
            'SELECT MAX(version_number) as maxVersion FROM company_document_versions WHERE document_id = @documentId',
            { documentId: { type: sql.Int, value: documentId } }
        );
        const nextVersion = (last?.maxVersion || 0) + 1;

        const versionResult = await tx.run(
            `INSERT INTO company_document_versions (tenant_id, document_id, version_number, original_file_name, stored_file_name, mime_type, size_bytes, uploaded_by)
             OUTPUT INSERTED.id
             VALUES (@tenantId, @documentId, @versionNumber, @originalFileName, @storedFileName, @mimeType, @sizeBytes, @uploadedBy)`,
            {
                tenantId: { type: sql.Int, value: tenantId },
                documentId: { type: sql.Int, value: documentId },
                versionNumber: { type: sql.Int, value: nextVersion },
                originalFileName: { type: sql.NVarChar(255), value: file.originalname },
                storedFileName: { type: sql.NVarChar(255), value: storedFileName },
                mimeType: { type: sql.NVarChar(100), value: file.mimetype },
                sizeBytes: { type: sql.BigInt, value: file.size },
                uploadedBy: { type: sql.Int, value: uploadedBy },
            }
        );
        const versionId = versionResult.recordset[0].id;

        await tx.run(
            'UPDATE company_documents SET current_version_id = @versionId, updated_at = SYSUTCDATETIME() WHERE id = @documentId',
            { versionId: { type: sql.Int, value: versionId }, documentId: { type: sql.Int, value: documentId } }
        );

        return versionId;
    });
}

function setStatus(tenantId, id, status) {
    return run('UPDATE company_documents SET status = @status, updated_at = SYSUTCDATETIME() WHERE tenant_id = @tenantId AND id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
        status: { type: sql.NVarChar(20), value: status },
    });
}

// Deletes shares -> versions -> the document itself in one transaction, and
// returns every version's stored_file_name so the route can unlink the
// on-disk files afterward (the filesystem isn't part of the transaction).
async function remove(tenantId, id) {
    const versions = await many('SELECT stored_file_name FROM company_document_versions WHERE tenant_id = @tenantId AND document_id = @id', {
        tenantId: { type: sql.Int, value: tenantId },
        id: { type: sql.Int, value: id },
    });

    await transaction(async (tx) => {
        await tx.run('UPDATE company_documents SET current_version_id = NULL WHERE tenant_id = @tenantId AND id = @id', {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
        await tx.run('DELETE FROM company_document_shares WHERE document_id = @id', { id: { type: sql.Int, value: id } });
        await tx.run('DELETE FROM company_document_versions WHERE tenant_id = @tenantId AND document_id = @id', {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
        await tx.run('DELETE FROM company_documents WHERE tenant_id = @tenantId AND id = @id', {
            tenantId: { type: sql.Int, value: tenantId },
            id: { type: sql.Int, value: id },
        });
    });

    return versions.map((v) => v.stored_file_name);
}

// Every active tenant user matching the document's share rows — used to fan
// out the publish/update notification. Same predicate as listVisibleToUser's
// VISIBILITY_EXISTS, but driven from `users` so it returns ids, not documents.
function resolveRecipientUserIds(tenantId, documentId) {
    return many(
        `SELECT DISTINCT u.id
         FROM users u
         WHERE u.tenant_id = @tenantId AND u.status = 'active'
           AND EXISTS (
               SELECT 1 FROM company_document_shares s
               WHERE s.document_id = @documentId
                 AND (
                     s.share_type = 'all'
                     OR (s.share_type = 'role' AND s.role_id IN (SELECT role_id FROM user_roles WHERE user_id = u.id))
                     OR (s.share_type = 'department' AND s.department_id = u.department_id)
                     OR (s.share_type = 'branch' AND s.location_id = u.location_id)
                 )
           )`,
        { tenantId: { type: sql.Int, value: tenantId }, documentId: { type: sql.Int, value: documentId } }
    ).then((rows) => rows.map((r) => r.id));
}

function listRoleOptions(tenantId) {
    return rolesRepo.listRoles(tenantId).then((roles) => roles.map((r) => ({ id: r.id, name: r.name })));
}

module.exports = {
    listForAdmin,
    listVisibleToUser,
    isVisibleToUser,
    get,
    getShares,
    getLatestVersionFile,
    getVersionFile,
    listVersions,
    create,
    updateMetadata,
    addVersion,
    setStatus,
    remove,
    resolveRecipientUserIds,
    listRoleOptions,
};
