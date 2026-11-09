-- Patient bookings and each lab's daily token queue.

ALTER TABLE provider
    ADD COLUMN minutes_per_patient INTEGER NOT NULL DEFAULT 15 CHECK (minutes_per_patient BETWEEN 1 AND 240);

CREATE TABLE booking (
    id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    booking_number   TEXT NOT NULL UNIQUE,
    provider_id      BIGINT NOT NULL REFERENCES provider (id),
    offering_id      BIGINT NOT NULL REFERENCES offering (id),
    patient_name     TEXT NOT NULL,
    patient_phone    TEXT NOT NULL,
    visit_date       DATE NOT NULL,
    token            INTEGER NOT NULL CHECK (token > 0),
    price_at_booking NUMERIC(10, 2) NOT NULL,
    status           TEXT NOT NULL DEFAULT 'WAITING'
                     CHECK (status IN ('WAITING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    consent_at       TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (provider_id, visit_date, token)
);
CREATE INDEX ix_booking_queue ON booking (provider_id, visit_date, status);
