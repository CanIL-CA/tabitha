-- Sources' permissions (ADR 0027), which apps/sources' get_user_info() reads.

INSERT OR IGNORE INTO Permissions (id, app, permission) VALUES
	(5, 'sources', 'PROTECTED_ACCESS'),
	(6, 'sources', 'UPDATE_SOURCE');
