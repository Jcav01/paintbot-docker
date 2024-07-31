-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION pg_database_owner;

COMMENT ON SCHEMA public IS 'standard public schema';

-- DROP SEQUENCE public.destinations_destination_id_seq;

CREATE SEQUENCE public.destinations_destination_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;-- public.notification_sources definition

-- Drop table

-- DROP TABLE public.notification_sources;

CREATE TABLE public.notification_sources (
	notification_source varchar NOT NULL,
	CONSTRAINT notification_sources_pk PRIMARY KEY (notification_source)
);


-- public.notification_types definition

-- Drop table

-- DROP TABLE public.notification_types;

CREATE TABLE public.notification_types (
	notification_type varchar(16) NOT NULL,
	notification_source varchar NOT NULL,
	CONSTRAINT notification_types_pk PRIMARY KEY (notification_type),
	CONSTRAINT notification_types_notification_sources_fk FOREIGN KEY (notification_source) REFERENCES public.notification_sources(notification_source)
);


-- public.sources definition

-- Drop table

-- DROP TABLE public.sources;

CREATE TABLE public.sources (
	channel_id text NOT NULL,
	is_online bool NULL,
	notification_source varchar NOT NULL,
	source_url varchar NOT NULL,
	CONSTRAINT sources_pk PRIMARY KEY (channel_id),
	CONSTRAINT sources_unique UNIQUE (source_url),
	CONSTRAINT sources_notification_sources_fk FOREIGN KEY (notification_source) REFERENCES public.notification_sources(notification_source)
);


-- public.destinations definition

-- Drop table

-- DROP TABLE public.destinations;

CREATE TABLE public.destinations (
	destination_id serial4 NOT NULL,
	channel_id text NOT NULL,
	last_message_id text NULL,
	source_id text NOT NULL,
	minimum_interval int2 DEFAULT 15 NOT NULL,
	highlight_colour bytea DEFAULT '\x393134364646'::bytea NOT NULL,
	CONSTRAINT destinations_pk PRIMARY KEY (destination_id),
	CONSTRAINT destinations_un UNIQUE (channel_id, source_id),
	CONSTRAINT destinations_fk FOREIGN KEY (source_id) REFERENCES public.sources(channel_id)
);


-- public.past_notifications definition

-- Drop table

-- DROP TABLE public.past_notifications;

CREATE TABLE public.past_notifications (
	notification_id text NOT NULL,
	source_id text NOT NULL,
	notification_type varchar NOT NULL,
	received_date timestamptz NOT NULL,
	CONSTRAINT past_notifications_pk PRIMARY KEY (notification_id),
	CONSTRAINT past_notifications_un UNIQUE (notification_id, source_id),
	CONSTRAINT past_notifications_fk FOREIGN KEY (source_id) REFERENCES public.sources(channel_id),
	CONSTRAINT past_notifications_fk1 FOREIGN KEY (notification_type) REFERENCES public.notification_types(notification_type)
);