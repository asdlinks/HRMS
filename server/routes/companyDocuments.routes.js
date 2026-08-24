const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const repo = require('../repositories/companyDocuments.repository');
const notificationsRepo = require('../repositories/notifications.repository');
const { requirePermission } = require('../middleware/authorize');
const { HttpError } = require('../middleware/errorHandler');
const { validateBody } = require('../middleware/validate');
const { companyDocumentMetadataSchema } = require('../schemas');

const UPLOAD_ROOT = path.join(__dirname, '../uploads/company-documents');
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.png', '.jpg', '.jpeg']);
const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024;
const PREVIEWABLE_MIME_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/gif']);
const NOTIFICATION_LINK = '/company-documents';

const storage = multer.diskStorage({
    destination(req, file, cb) {
        const dir = path.join(UPLOAD_ROOT, String(req.auth.tenantId));
        fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    // Never trust the client-supplied original name for the on-disk name —
    // a random name sidesteps path traversal and collisions; the original
    // name is kept in the DB (original_file_name) for display/download.
    filename(req, file, cb) {
        cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_FILE_SIZE_BYTES },
    fileFilter(req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        if (!ALLOWED_EXTENSIONS.has(ext)) return cb(new HttpError(400, `File type "${ext || 'unknown'}" is not allowed`));
        cb(null, true);
    },
});

// Adapts multer's callback-style errors (including MulterError for
// oversized files) into the HttpError shape the centralized errorHandler
// expects, instead of letting them fall through as an unhandled 500.
function handleUpload(middleware) {
    return (req, res, next) => {
        middleware(req, res, (err) => {
            if (!err) return next();
            if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
                return next(new HttpError(400, 'File exceeds the 20MB size limit'));
            }
            next(err instanceof HttpError ? err : new HttpError(400, err.message));
        });
    };
}

// The multipart create/version-upload routes carry `visibility` as a
// JSON-stringified form field (FormData can't nest objects) — parse it back
// into an object before validating against the same schema PATCH (JSON body)
// uses via validateBody.
function parseMultipartMetadata(req, res, next) {
    let visibility;
    try {
        visibility = JSON.parse(req.body.visibility || '{}');
    } catch {
        return next(new HttpError(400, 'visibility must be valid JSON'));
    }
    const result = companyDocumentMetadataSchema.safeParse({ ...req.body, visibility });
    if (!result.success) {
        const message = result.error.issues.map((issue) => `${issue.path.join('.') || 'body'}: ${issue.message}`).join('; ');
        return next(new HttpError(400, message));
    }
    req.body = result.data;
    next();
}

const hasManage = (req) => !!req.auth?.permissions?.includes('company-documents.manage');

async function notifyRecipients(tenantId, documentId, title, action) {
    const userIds = await repo.resolveRecipientUserIds(tenantId, documentId);
    const message = action === 'published' ? `New document published: ${title}` : `Document updated: ${title}`;
    await Promise.all(
        userIds.map((userId) => notificationsRepo.createNotification(tenantId, userId, message, 'company_document', NOTIFICATION_LINK))
    );
}

// Resolves the on-disk file for a download/preview request: the latest
// version by default, or a specific historical version via ?versionId=
// (admin-only — employees only ever see "the" current document). Non-admins
// get the same visibility check the employee list itself uses, so a guessed
// document id doesn't leak whether it exists.
async function resolveFileForRequest(req) {
    const tenantId = req.auth.tenantId;
    const documentId = req.params.id;
    const { versionId } = req.query;

    if (versionId) {
        if (!hasManage(req)) throw new HttpError(403, 'You do not have permission to perform this action');
        const version = await repo.getVersionFile(tenantId, documentId, versionId);
        if (!version) throw new HttpError(404, 'Version not found');
        return version;
    }

    if (!hasManage(req)) {
        const visible = await repo.isVisibleToUser(tenantId, documentId, req.auth.userId);
        if (!visible) throw new HttpError(404, 'Document not found');
    }
    const version = await repo.getLatestVersionFile(tenantId, documentId);
    if (!version) throw new HttpError(404, 'Document not found');
    return version;
}

const router = express.Router();

router.get('/lookups/roles', requirePermission('company-documents.manage'), async (req, res) => {
    res.json(await repo.listRoleOptions(req.auth.tenantId));
});

router.get('/', async (req, res) => {
    const tenantId = req.auth.tenantId;
    if (hasManage(req)) {
        res.json(await repo.listForAdmin(tenantId, { status: req.query.status, category: req.query.category, search: req.query.search }));
    } else {
        res.json(await repo.listVisibleToUser(tenantId, req.auth.userId, { category: req.query.category, search: req.query.search }));
    }
});

router.post('/', requirePermission('company-documents.manage'), handleUpload(upload.single('file')), parseMultipartMetadata, async (req, res) => {
    if (!req.file) throw new HttpError(400, 'A file is required');
    const documentId = await repo.create(req.auth.tenantId, req.body, req.auth.userId, req.file, req.file.filename);
    await notifyRecipients(req.auth.tenantId, documentId, req.body.title, 'published');
    res.json({ id: documentId });
});

router.get('/:id', async (req, res) => {
    const tenantId = req.auth.tenantId;
    const doc = await repo.get(tenantId, req.params.id);
    if (!doc) throw new HttpError(404, 'Document not found');
    if (!hasManage(req)) {
        const visible = await repo.isVisibleToUser(tenantId, req.params.id, req.auth.userId);
        if (!visible) throw new HttpError(404, 'Document not found');
        return res.json(doc);
    }
    res.json({ ...doc, shares: await repo.getShares(tenantId, req.params.id) });
});

router.patch('/:id', requirePermission('company-documents.manage'), validateBody(companyDocumentMetadataSchema), async (req, res) => {
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    await repo.updateMetadata(req.auth.tenantId, req.params.id, req.body);
    res.json({ success: true });
});

router.post('/:id/versions', requirePermission('company-documents.manage'), handleUpload(upload.single('file')), async (req, res) => {
    if (!req.file) throw new HttpError(400, 'A file is required');
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    await repo.addVersion(req.auth.tenantId, req.params.id, req.file, req.file.filename, req.auth.userId);
    await notifyRecipients(req.auth.tenantId, req.params.id, existing.title, 'updated');
    res.json({ success: true });
});

router.get('/:id/versions', requirePermission('company-documents.manage'), async (req, res) => {
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    res.json(await repo.listVersions(req.auth.tenantId, req.params.id));
});

router.patch('/:id/archive', requirePermission('company-documents.manage'), async (req, res) => {
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    await repo.setStatus(req.auth.tenantId, req.params.id, 'archived');
    res.json({ success: true });
});

router.patch('/:id/restore', requirePermission('company-documents.manage'), async (req, res) => {
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    await repo.setStatus(req.auth.tenantId, req.params.id, 'active');
    res.json({ success: true });
});

router.delete('/:id', requirePermission('company-documents.manage'), async (req, res) => {
    const existing = await repo.get(req.auth.tenantId, req.params.id);
    if (!existing) throw new HttpError(404, 'Document not found');
    const storedFileNames = await repo.remove(req.auth.tenantId, req.params.id);
    for (const storedFileName of storedFileNames) {
        fs.unlink(path.join(UPLOAD_ROOT, String(req.auth.tenantId), storedFileName), () => {});
    }
    res.json({ success: true });
});

router.get('/:id/download', async (req, res) => {
    const version = await resolveFileForRequest(req);
    const filePath = path.join(UPLOAD_ROOT, String(req.auth.tenantId), version.stored_file_name);
    res.download(filePath, version.original_file_name);
});

router.get('/:id/preview', async (req, res) => {
    const version = await resolveFileForRequest(req);
    if (!PREVIEWABLE_MIME_TYPES.has(version.mime_type)) throw new HttpError(415, 'This file type cannot be previewed inline');
    const filePath = path.join(UPLOAD_ROOT, String(req.auth.tenantId), version.stored_file_name);
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(version.original_file_name)}"`);
    res.setHeader('Content-Type', version.mime_type);
    res.sendFile(filePath);
});

module.exports = router;
