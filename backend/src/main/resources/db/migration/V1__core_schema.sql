-- Core schema. Facts shown to patients live in append-only *_version tables:
-- a change is a new row, and a reviewed row can never be altered or removed.

CREATE TABLE app_user (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email         TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('PROVIDER', 'ADMIN')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_app_user_email ON app_user (lower(email));

CREATE TABLE provider (
    id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    owner_user_id BIGINT NOT NULL UNIQUE REFERENCES app_user (id),
    provider_type TEXT NOT NULL DEFAULT 'DIAGNOSTIC_LAB',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_profile_version (
    id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id  BIGINT NOT NULL REFERENCES provider (id),
    data         JSONB NOT NULL,
    source_type  TEXT NOT NULL CHECK (source_type IN ('PROVIDER_DECLARED', 'DEMO_DATA')),
    status       TEXT NOT NULL DEFAULT 'PENDING'
                 CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
    submitted_by BIGINT REFERENCES app_user (id),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by  BIGINT REFERENCES app_user (id),
    reviewed_at  TIMESTAMPTZ,
    review_note  TEXT
);
CREATE INDEX ix_profile_version_provider ON provider_profile_version (provider_id, status);
CREATE UNIQUE INDEX ux_profile_one_pending ON provider_profile_version (provider_id) WHERE status = 'PENDING';

CREATE TABLE catalog_service (
    id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name     TEXT NOT NULL UNIQUE,
    category TEXT NOT NULL CHECK (category IN ('PATHOLOGY', 'RADIOLOGY', 'CARDIOLOGY', 'PACKAGE')),
    aliases  TEXT NOT NULL DEFAULT ''
);

CREATE TABLE offering (
    id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    provider_id        BIGINT NOT NULL REFERENCES provider (id),
    catalog_service_id BIGINT NOT NULL REFERENCES catalog_service (id),
    active             BOOLEAN NOT NULL DEFAULT TRUE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, catalog_service_id)
);

CREATE TABLE offering_version (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    offering_id      BIGINT NOT NULL REFERENCES offering (id),
    regular_price    NUMERIC(10, 2) NOT NULL CHECK (regular_price > 0),
    discounted_price NUMERIC(10, 2) CHECK (discounted_price > 0 AND discounted_price <= regular_price),
    home_collection  BOOLEAN NOT NULL,
    report_tat_hours INTEGER NOT NULL CHECK (report_tat_hours > 0),
    effective_from   DATE NOT NULL,
    source_type      TEXT NOT NULL CHECK (source_type IN ('PROVIDER_DECLARED', 'DEMO_DATA')),
    source_note      TEXT,
    status           TEXT NOT NULL DEFAULT 'PENDING'
                     CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
    submitted_by     BIGINT REFERENCES app_user (id),
    submitted_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_by      BIGINT REFERENCES app_user (id),
    reviewed_at      TIMESTAMPTZ,
    review_note      TEXT
);
CREATE INDEX ix_offering_version_offering ON offering_version (offering_id, status);
CREATE UNIQUE INDEX ux_offering_one_pending ON offering_version (offering_id) WHERE status = 'PENDING';

CREATE TABLE audit_log (
    id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    actor_id    BIGINT REFERENCES app_user (id),
    action      TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id   BIGINT NOT NULL,
    detail      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- History guarantees, enforced by the database so no code path can bypass them.
CREATE FUNCTION guard_version_update() RETURNS trigger AS $$
DECLARE
    review_fields TEXT[] := ARRAY['status', 'reviewed_by', 'reviewed_at', 'review_note'];
BEGIN
    IF OLD.status <> 'PENDING' THEN
        RAISE EXCEPTION 'reviewed version % is immutable', OLD.id;
    END IF;
    IF (to_jsonb(NEW) - review_fields) IS DISTINCT FROM (to_jsonb(OLD) - review_fields) THEN
        RAISE EXCEPTION 'version % content is immutable; submit a new version', OLD.id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION forbid_change() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION '% is not permitted on %', TG_OP, TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profile_version_update BEFORE UPDATE ON provider_profile_version
    FOR EACH ROW EXECUTE FUNCTION guard_version_update();
CREATE TRIGGER profile_version_delete BEFORE DELETE ON provider_profile_version
    FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER offering_version_update BEFORE UPDATE ON offering_version
    FOR EACH ROW EXECUTE FUNCTION guard_version_update();
CREATE TRIGGER offering_version_delete BEFORE DELETE ON offering_version
    FOR EACH ROW EXECUTE FUNCTION forbid_change();
CREATE TRIGGER audit_log_immutable BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION forbid_change();

-- What patients may see: the newest approved profile of each provider...
CREATE VIEW published_profile AS
SELECT DISTINCT ON (provider_id) *
FROM provider_profile_version
WHERE status = 'APPROVED'
ORDER BY provider_id, reviewed_at DESC, id DESC;

-- ...and each active offering's approved version that is in effect today (IST).
CREATE VIEW published_offering AS
SELECT DISTINCT ON (v.offering_id)
       v.*, o.provider_id, o.catalog_service_id
FROM offering_version v
JOIN offering o ON o.id = v.offering_id AND o.active
JOIN published_profile p ON p.provider_id = o.provider_id
WHERE v.status = 'APPROVED'
  AND v.effective_from <= (now() AT TIME ZONE 'Asia/Kolkata')::date
ORDER BY v.offering_id, v.effective_from DESC, v.reviewed_at DESC, v.id DESC;
