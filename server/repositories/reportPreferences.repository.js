const { one, many, run, sql } = require('../db/sql');

function listFavorites(tenantId, userId) {
    return many(
        `SELECT report_id FROM report_favorites WHERE tenant_id = @tenantId AND user_id = @userId ORDER BY created_at DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

async function addFavorite(tenantId, userId, reportId) {
    const existing = await one(
        `SELECT id FROM report_favorites WHERE tenant_id = @tenantId AND user_id = @userId AND report_id = @reportId`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId }, reportId: { type: sql.NVarChar(60), value: reportId } }
    );
    if (existing) return;
    await run(
        `INSERT INTO report_favorites (tenant_id, user_id, report_id) VALUES (@tenantId, @userId, @reportId)`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId }, reportId: { type: sql.NVarChar(60), value: reportId } }
    );
}

function removeFavorite(tenantId, userId, reportId) {
    return run(
        `DELETE FROM report_favorites WHERE tenant_id = @tenantId AND user_id = @userId AND report_id = @reportId`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId }, reportId: { type: sql.NVarChar(60), value: reportId } }
    );
}

function listSavedFilters(tenantId, userId, reportId) {
    let query = `SELECT id, report_id, name, filters, created_at FROM report_saved_filters WHERE tenant_id = @tenantId AND user_id = @userId`;
    const params = { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } };
    if (reportId) {
        query += ' AND report_id = @reportId';
        params.reportId = { type: sql.NVarChar(60), value: reportId };
    }
    query += ' ORDER BY created_at DESC';
    return many(query, params);
}

async function createSavedFilter(tenantId, userId, { reportId, name, filters }) {
    const result = await run(
        `INSERT INTO report_saved_filters (tenant_id, user_id, report_id, name, filters)
         OUTPUT INSERTED.id
         VALUES (@tenantId, @userId, @reportId, @name, @filters)`,
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            reportId: { type: sql.NVarChar(60), value: reportId },
            name: { type: sql.NVarChar(200), value: name },
            filters: { type: sql.NVarChar(sql.MAX), value: JSON.stringify(filters || {}) },
        }
    );
    return result.recordset[0].id;
}

function deleteSavedFilter(tenantId, userId, id) {
    return run(
        `DELETE FROM report_saved_filters WHERE id = @id AND tenant_id = @tenantId AND user_id = @userId`,
        { id: { type: sql.Int, value: id }, tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

module.exports = { listFavorites, addFavorite, removeFavorite, listSavedFilters, createSavedFilter, deleteSavedFilter };
