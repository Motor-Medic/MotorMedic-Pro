-- Custom CMMS Templates table for storing user-defined CMMS field mappings
-- Created by screenshot parser with human review

CREATE TABLE IF NOT EXISTS custom_cmms_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_name TEXT NOT NULL,
    field_schema JSONB NOT NULL,
    created_by_tenant TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fuzzy search on program_name
CREATE INDEX IF NOT EXISTS idx_custom_cmms_templates_name_trgm 
ON custom_cmms_templates USING GIN (program_name gin_trgm_ops);

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;