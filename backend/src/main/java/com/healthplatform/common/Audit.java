package com.healthplatform.common;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class Audit {
    private final JdbcClient db;

    Audit(JdbcClient db) {
        this.db = db;
    }

    public void record(long actorId, String action, String entityType, long entityId, String detail) {
        db.sql("""
                INSERT INTO audit_log (actor_id, action, entity_type, entity_id, detail)
                VALUES (?, ?, ?, ?, ?)""")
                .params(actorId, action, entityType, entityId, detail)
                .update();
    }
}
