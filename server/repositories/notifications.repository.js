const { many, run, sql } = require('../db/sql');

function createNotification(tenantId, userId, message, type, link) {
    return run(
        'INSERT INTO notifications (tenant_id, user_id, message, type, link) VALUES (@tenantId, @userId, @message, @type, @link)',
        {
            tenantId: { type: sql.Int, value: tenantId },
            userId: { type: sql.Int, value: userId },
            message: { type: sql.NVarChar(sql.MAX), value: message },
            type: { type: sql.NVarChar(50), value: type || null },
            link: { type: sql.NVarChar(500), value: link || null },
        }
    );
}

function listUnread(tenantId, userId) {
    return many(
        `SELECT TOP 20 * FROM notifications
         WHERE tenant_id = @tenantId AND user_id = @userId AND is_read = 0
         ORDER BY created_at DESC`,
        { tenantId: { type: sql.Int, value: tenantId }, userId: { type: sql.Int, value: userId } }
    );
}

function markAllRead(tenantId, userId) {
    return run('UPDATE notifications SET is_read = 1 WHERE tenant_id = @tenantId AND user_id = @userId', {
        tenantId: { type: sql.Int, value: tenantId },
        userId: { type: sql.Int, value: userId },
    });
}

module.exports = { createNotification, listUnread, markAllRead };
