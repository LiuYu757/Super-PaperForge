-- Partial unique index: only one owner per project
CREATE UNIQUE INDEX idx_one_owner_per_project ON project_members(project_id) WHERE role = 'owner';

-- Partial unique index: unique file path per project (only for non-deleted files)
CREATE UNIQUE INDEX idx_files_unique_path ON files(project_id, path) WHERE deleted_at IS NULL;
