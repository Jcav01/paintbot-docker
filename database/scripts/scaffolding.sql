-- DROP SCHEMA paintbot;

CREATE SCHEMA paintbot AUTHORIZATION cloudsqlsuperuser;

COMMENT ON SCHEMA paintbot IS 'standard paintbot schema';

CREATE ROLE paintbot WITH 
	NOSUPERUSER
	CREATEDB
	CREATEROLE
	INHERIT
	LOGIN
	NOREPLICATION
	NOBYPASSRLS
	CONNECTION LIMIT -1;

ALTER USER paintbot WITH PASSWORD 'password';

-- DROP SEQUENCE paintbot.destinations_destination_id_seq;

CREATE SEQUENCE paintbot.destinations_destination_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE paintbot.destinations_destination_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE paintbot.destinations_destination_id_seq TO postgres;
GRANT ALL ON SEQUENCE paintbot.destinations_destination_id_seq TO paintbot;

-- DROP SEQUENCE paintbot.past_notifications_notification_id_seq;

CREATE SEQUENCE paintbot.past_notifications_notification_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE paintbot.past_notifications_notification_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE paintbot.past_notifications_notification_id_seq TO postgres;
GRANT ALL ON SEQUENCE paintbot.past_notifications_notification_id_seq TO paintbot;

-- DROP SEQUENCE paintbot.servers_server_id_seq;

CREATE SEQUENCE paintbot.servers_server_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;

-- Permissions

ALTER SEQUENCE paintbot.servers_server_id_seq OWNER TO postgres;
GRANT ALL ON SEQUENCE paintbot.servers_server_id_seq TO postgres;
-- paintbot.notification_sources definition

-- Drop table

-- DROP TABLE paintbot.notification_sources;

CREATE TABLE paintbot.notification_sources (
	notification_source varchar NOT NULL,
	CONSTRAINT notification_sources_pk PRIMARY KEY (notification_source)
);

-- Permissions

ALTER TABLE paintbot.notification_sources OWNER TO postgres;
GRANT ALL ON TABLE paintbot.notification_sources TO postgres;
GRANT ALL ON TABLE paintbot.notification_sources TO paintbot;


-- paintbot.servers definition

-- Drop table

-- DROP TABLE paintbot.servers;

CREATE TABLE paintbot.servers (
	server_id text NOT NULL,
	server_name text NULL,
	CONSTRAINT servers_pk PRIMARY KEY (server_id)
);

-- Permissions

ALTER TABLE paintbot.servers OWNER TO postgres;
GRANT ALL ON TABLE paintbot.servers TO postgres;
GRANT SELECT ON TABLE paintbot.servers TO paintbot;


-- paintbot.notification_types definition

-- Drop table

-- DROP TABLE paintbot.notification_types;

CREATE TABLE paintbot.notification_types (
	notification_type varchar(16) NOT NULL,
	notification_source varchar NOT NULL,
	CONSTRAINT notification_types_pk PRIMARY KEY (notification_type),
	CONSTRAINT notification_types_notification_sources_fk FOREIGN KEY (notification_source) REFERENCES paintbot.notification_sources(notification_source)
);

-- Permissions

ALTER TABLE paintbot.notification_types OWNER TO postgres;
GRANT ALL ON TABLE paintbot.notification_types TO postgres;
GRANT ALL ON TABLE paintbot.notification_types TO paintbot;


-- paintbot.sources definition

-- Drop table

-- DROP TABLE paintbot.sources;

CREATE TABLE paintbot.sources (
	source_id text NOT NULL,
	is_online bool DEFAULT false NOT NULL,
	notification_source varchar NOT NULL,
	source_username varchar NOT NULL,
	CONSTRAINT sources_pk PRIMARY KEY (source_id),
	CONSTRAINT sources_unique UNIQUE (source_username),
	CONSTRAINT sources_notification_sources_fk FOREIGN KEY (notification_source) REFERENCES paintbot.notification_sources(notification_source)
);

-- Permissions

ALTER TABLE paintbot.sources OWNER TO postgres;
GRANT ALL ON TABLE paintbot.sources TO postgres;
GRANT ALL ON TABLE paintbot.sources TO paintbot;


-- paintbot.destinations definition

-- Drop table

-- DROP TABLE paintbot.destinations;

CREATE TABLE paintbot.destinations (
	destination_id serial4 NOT NULL,
	channel_id text NOT NULL,
	last_message_id text NULL,
	source_id text NOT NULL,
	minimum_interval int2 DEFAULT 15 NULL,
	highlight_colour bytea DEFAULT '\x393134364646'::bytea NOT NULL,
	notification_message text NULL, -- The message added to a message alongside a notification
	CONSTRAINT destinations_pk PRIMARY KEY (destination_id),
	CONSTRAINT destinations_un UNIQUE (channel_id, source_id),
	CONSTRAINT destinations_fk FOREIGN KEY (source_id) REFERENCES paintbot.sources(source_id)
);

-- Column comments

COMMENT ON COLUMN paintbot.destinations.notification_message IS 'The message added to a message alongside a notification';

-- Permissions

ALTER TABLE paintbot.destinations OWNER TO postgres;
GRANT ALL ON TABLE paintbot.destinations TO postgres;
GRANT ALL ON TABLE paintbot.destinations TO paintbot;


-- paintbot.past_notifications definition

-- Drop table

-- DROP TABLE paintbot.past_notifications;

CREATE TABLE paintbot.past_notifications (
	source_id text NOT NULL,
	notification_type varchar NOT NULL,
	received_date timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	notification_id bigserial NOT NULL,
	notification_info jsonb NULL,
	CONSTRAINT past_notifications_pk PRIMARY KEY (notification_id),
	CONSTRAINT past_notifications_fk FOREIGN KEY (source_id) REFERENCES paintbot.sources(source_id) ON DELETE CASCADE,
	CONSTRAINT past_notifications_fk1 FOREIGN KEY (notification_type) REFERENCES paintbot.notification_types(notification_type)
);
CREATE INDEX ix_past_notifications_video ON paintbot.past_notifications USING btree (((notification_info ->> 'id'::text)));
CREATE INDEX past_notifications_notification_info_gin ON paintbot.past_notifications USING gin (notification_info jsonb_path_ops);
CREATE UNIQUE INDEX ux_past_notifications_video_type ON paintbot.past_notifications USING btree (((notification_info ->> 'id'::text)), notification_type);

-- Permissions

ALTER TABLE paintbot.past_notifications OWNER TO postgres;
GRANT ALL ON TABLE paintbot.past_notifications TO postgres;
GRANT ALL ON TABLE paintbot.past_notifications TO paintbot;


-- Permissions

GRANT ALL ON SCHEMA paintbot TO cloudsqlsuperuser;
GRANT USAGE ON SCHEMA paintbot TO paintbot;
GRANT USAGE ON SCHEMA paintbot TO paintbot;