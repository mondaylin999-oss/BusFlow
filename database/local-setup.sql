-- One-time local dev setup. Run as the postgres superuser.
-- Creates the app role and database used by backend/.env
SELECT 'CREATE ROLE busflow LOGIN PASSWORD ''busflow_dev'''
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'busflow') \gexec

SELECT 'CREATE DATABASE busflow OWNER busflow'
WHERE NOT EXISTS (SELECT 1 FROM pg_database WHERE datname = 'busflow') \gexec
