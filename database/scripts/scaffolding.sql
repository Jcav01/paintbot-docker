-- DROP SCHEMA public;

CREATE SCHEMA public AUTHORIZATION cloudsqlsuperuser;

-- DROP SEQUENCE public.destinations_destination_id_seq;

CREATE SEQUENCE public.destinations_destination_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 2147483647
	START 1
	CACHE 1
	NO CYCLE;
-- DROP SEQUENCE public.past_notifications_notification_id_seq;

CREATE SEQUENCE public.past_notifications_notification_id_seq
	INCREMENT BY 1
	MINVALUE 1
	MAXVALUE 9223372036854775807
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
	source_id text NOT NULL,
	is_online bool DEFAULT false NOT NULL,
	notification_source varchar NOT NULL,
	source_username varchar NOT NULL,
	CONSTRAINT sources_pk PRIMARY KEY (source_id),
	CONSTRAINT sources_unique UNIQUE (source_username),
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
	minimum_interval int2 DEFAULT 15 NULL,
	highlight_colour bytea DEFAULT '\x393134364646'::bytea NOT NULL,
	notification_message text NULL,
	CONSTRAINT destinations_pk PRIMARY KEY (destination_id),
	CONSTRAINT destinations_un UNIQUE (channel_id, source_id),
	CONSTRAINT destinations_fk FOREIGN KEY (source_id) REFERENCES public.sources(source_id)
);


-- public.past_notifications definition

-- Drop table

-- DROP TABLE public.past_notifications;

CREATE TABLE public.past_notifications (
	source_id text NOT NULL,
	notification_type varchar NOT NULL,
	received_date timestamptz DEFAULT CURRENT_TIMESTAMP NOT NULL,
	notification_id bigserial NOT NULL,
	notification_info jsonb NULL,
	CONSTRAINT past_notifications_pk PRIMARY KEY (notification_id),
	CONSTRAINT past_notifications_fk FOREIGN KEY (source_id) REFERENCES public.sources(source_id) ON DELETE CASCADE,
	CONSTRAINT past_notifications_fk1 FOREIGN KEY (notification_type) REFERENCES public.notification_types(notification_type)
);
CREATE INDEX past_notifications_notification_info_gin ON public.past_notifications USING gin (notification_info jsonb_path_ops);

-- Composite unique index: each (videoId, notification_type) only once
CREATE UNIQUE INDEX IF NOT EXISTS ux_past_notifications_video_type
  ON past_notifications ((notification_info->>'id'), notification_type);

-- Supporting non-unique index on just videoId for faster lookups of all stages
CREATE INDEX IF NOT EXISTS ix_past_notifications_video
  ON past_notifications ((notification_info->>'id'));


-- public.google_db_advisor_agg_query_recommendations source

CREATE OR REPLACE VIEW public.google_db_advisor_agg_query_recommendations
AS SELECT database_name,
    recommendations
   FROM google_db_advisor_agg_query_recommendations_impl() v(database_name text, recommendations text);


-- public.google_db_advisor_agg_recommendations source

CREATE OR REPLACE VIEW public.google_db_advisor_agg_recommendations
AS SELECT database_name,
    recommendations
   FROM google_db_advisor_agg_recommendations_impl() v(database_name text, recommendations text);


-- public.google_db_advisor_catalog_auto_config source

CREATE OR REPLACE VIEW public.google_db_advisor_catalog_auto_config
AS SELECT auto_config
   FROM google_db_advisor_catalog_auto_config_impl() v(auto_config text);


-- public.google_db_advisor_index_state source

CREATE OR REPLACE VIEW public.google_db_advisor_index_state
AS SELECT index,
    state
   FROM google_db_advisor_index_state_impl() v(index regclass, state text);


-- public.google_db_advisor_local_auto_config source

CREATE OR REPLACE VIEW public.google_db_advisor_local_auto_config
AS SELECT auto_config
   FROM google_db_advisor_local_auto_config_impl() v(auto_config text);


-- public.google_db_advisor_query_tuning_advices source

CREATE OR REPLACE VIEW public.google_db_advisor_query_tuning_advices
AS SELECT user_id,
    db_id,
    query_id,
    trace_id,
    span_id,
    parent_span_id,
    advice
   FROM google_db_advisor_query_tuning_advices_impl() v(user_id oid, db_id oid, query_id bigint, trace_id text, span_id text, parent_span_id text, advice text);


-- public.google_db_advisor_recommended_columnar_configuration source

CREATE OR REPLACE VIEW public.google_db_advisor_recommended_columnar_configuration
AS SELECT name,
    value
   FROM google_db_advisor_recommended_columnar_configuration_impl() v(name text, value text);


-- public.google_db_advisor_recommended_indexes source

CREATE OR REPLACE VIEW public.google_db_advisor_recommended_indexes
AS SELECT index,
    estimated_storage_size_in_mb,
    num_impacted_queries
   FROM google_db_advisor_recommended_indexes_impl() v(index text, estimated_storage_size_in_mb bigint, num_impacted_queries bigint);


-- public.google_db_advisor_recommended_indexes_to_drop source

CREATE OR REPLACE VIEW public.google_db_advisor_recommended_indexes_to_drop
AS SELECT index,
    last_access,
    storage_in_mb,
    benefit
   FROM google_db_advisor_recommended_indexes_to_drop_impl() v(index regclass, last_access date, storage_in_mb bigint, benefit text);


-- public.google_db_advisor_stat_statements source

CREATE OR REPLACE VIEW public.google_db_advisor_stat_statements
AS SELECT metric_name,
    metric_type,
    metric_value
   FROM google_db_advisor_stat_statements_impl() v(metric_name text, metric_type text, metric_value numeric);


-- public.google_db_advisor_stats source

CREATE OR REPLACE VIEW public.google_db_advisor_stats
AS SELECT value
   FROM google_db_advisor_stats_impl() v(value text);


-- public.google_db_advisor_workload_advisory source

CREATE OR REPLACE VIEW public.google_db_advisor_workload_advisory
AS SELECT advisory
   FROM google_db_advisor_workload_advisory_impl() v(advisory text);


-- public.google_db_advisor_workload_columnar_report source

CREATE OR REPLACE VIEW public.google_db_advisor_workload_columnar_report
AS SELECT user_id,
    db_id,
    query_id,
    init_cost,
    new_cost,
    num_calls,
    total_time,
    recommended_columnar_columns
   FROM google_db_advisor_workload_columnar_report_impl() v(user_id oid, db_id oid, query_id numeric, init_cost double precision, new_cost double precision, num_calls bigint, total_time double precision, recommended_columnar_columns text);


-- public.google_db_advisor_workload_report source

CREATE OR REPLACE VIEW public.google_db_advisor_workload_report
AS SELECT user_id,
    db_id,
    query_id,
    init_cost,
    new_cost,
    num_calls,
    total_time,
    recommended_indexes
   FROM google_db_advisor_workload_report_impl() v(user_id oid, db_id oid, query_id numeric, init_cost double precision, new_cost double precision, num_calls bigint, total_time double precision, recommended_indexes text);


-- public.google_db_advisor_workload_report_detail source

CREATE OR REPLACE VIEW public.google_db_advisor_workload_report_detail
AS SELECT report_detail
   FROM google_db_advisor_workload_report_detail_impl() v(report_detail text);


-- public.google_db_advisor_workload_statements source

CREATE OR REPLACE VIEW public.google_db_advisor_workload_statements
AS SELECT user_id,
    db_id,
    query_id,
    query,
    num_calls,
    total_time
   FROM google_db_advisor_workload_statements_impl() v(user_id oid, db_id oid, query_id numeric, query text, num_calls bigint, total_time double precision);


-- public.hypopg_list_indexes source

CREATE OR REPLACE VIEW public.hypopg_list_indexes
AS SELECT h.indexrelid,
    h.indexname AS index_name,
    n.nspname AS schema_name,
    COALESCE(c.relname, '<dropped>'::name) AS table_name,
    am.amname AS am_name
   FROM hypopg() h(indexname, indexrelid, indrelid, innatts, indisunique, indkey, indcollation, indclass, indoption, indexprs, indpred, amid)
     LEFT JOIN pg_class c ON c.oid = h.indrelid
     LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_am am ON am.oid = h.amid;



-- DROP FUNCTION public.google_db_advisor_agg_query_recommendations_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_agg_query_recommendations_impl()
 RETURNS SETOF record
 LANGUAGE c
 STABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_agg_query_recommendations_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_agg_recommendations_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_agg_recommendations_impl()
 RETURNS SETOF record
 LANGUAGE c
 STABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_agg_recommendations_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_alter_index_state(regclass, text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_alter_index_state(index regclass, index_state text)
 RETURNS void
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_alter_index_state$function$
;

-- DROP FUNCTION public.google_db_advisor_catalog_auto_config_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_catalog_auto_config_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_catalog_auto_config_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_create_recommended_indexes();

CREATE OR REPLACE FUNCTION public.google_db_advisor_create_recommended_indexes()
 RETURNS void
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_create_recommended_indexes$function$
;

-- DROP FUNCTION public.google_db_advisor_database_query_recommendations(in _text, in _int4, in _int8, out text, out text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_database_query_recommendations(database_name text[], db_query_count integer[], query_hash bigint[], OUT database_name text, OUT recommendations text)
 RETURNS SETOF record
 LANGUAGE c
 STABLE
AS '$libdir/google_db_advisor', $function$google_db_advisor_database_query_recommendations$function$
;

-- DROP FUNCTION public.google_db_advisor_drop_recommended_indexes();

CREATE OR REPLACE FUNCTION public.google_db_advisor_drop_recommended_indexes()
 RETURNS void
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_drop_recommended_indexes$function$
;

-- DROP FUNCTION public.google_db_advisor_index_state_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_index_state_impl()
 RETURNS SETOF record
 LANGUAGE c
 STABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_index_state_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_local_auto_config_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_local_auto_config_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_local_auto_config_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_num_statements();

CREATE OR REPLACE FUNCTION public.google_db_advisor_num_statements()
 RETURNS bigint
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_num_statements$function$
;

-- DROP FUNCTION public.google_db_advisor_query_recommendations(in int8, in text, out int8, out text, out text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_query_recommendations(query_hash bigint DEFAULT 0, database_name text DEFAULT ''::text, OUT query_hash bigint, OUT database_name text, OUT recommendations text)
 RETURNS SETOF record
 LANGUAGE c
 STABLE
AS '$libdir/google_db_advisor', $function$google_db_advisor_query_recommendations$function$
;

-- DROP FUNCTION public.google_db_advisor_query_tuning_advice(in int4, in text, in int8, in text, in text, in text, out text, out text, out text, out text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_query_tuning_advice(user_id integer DEFAULT 0, database_name text DEFAULT ''::text, query_hash bigint DEFAULT 0, trace_id text DEFAULT ''::text, span_id text DEFAULT ''::text, parent_span_id text DEFAULT ''::text, OUT trace_id text, OUT span_id text, OUT parent_span_id text, OUT advice text)
 RETURNS SETOF record
 LANGUAGE c
 STABLE
AS '$libdir/google_db_advisor', $function$google_db_advisor_query_tuning_advice$function$
;

-- DROP FUNCTION public.google_db_advisor_query_tuning_advices_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_query_tuning_advices_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_query_tuning_advices_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_recommend(out text, out text, out text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_recommend(OUT advisor text, OUT name text, OUT value text)
 RETURNS SETOF record
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_recommend$function$
;

-- DROP FUNCTION public.google_db_advisor_recommend_indexes(in int8, in int8, out text, out int8);

CREATE OR REPLACE FUNCTION public.google_db_advisor_recommend_indexes(max_index_width bigint DEFAULT 2, max_storage_size_in_mb bigint DEFAULT 0, OUT index text, OUT estimated_storage_size_in_mb bigint)
 RETURNS SETOF record
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_recommend_indexes$function$
;

-- DROP FUNCTION public.google_db_advisor_recommended_columnar_configuration_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_recommended_columnar_configuration_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_recommended_columnar_configuration_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_recommended_indexes_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_recommended_indexes_impl()
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_recommended_indexes_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_recommended_indexes_to_drop_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_recommended_indexes_to_drop_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_recommended_indexes_to_drop_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_reset();

CREATE OR REPLACE FUNCTION public.google_db_advisor_reset()
 RETURNS void
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_reset$function$
;

-- DROP FUNCTION public.google_db_advisor_stat_statements_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_stat_statements_impl()
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_stat_statements_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_statements_file_used_size();

CREATE OR REPLACE FUNCTION public.google_db_advisor_statements_file_used_size()
 RETURNS bigint
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_statements_file_used_size$function$
;

-- DROP FUNCTION public.google_db_advisor_stats_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_stats_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_stats_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_test();

CREATE OR REPLACE FUNCTION public.google_db_advisor_test()
 RETURNS void
 LANGUAGE c
AS '$libdir/google_db_advisor', $function$google_db_advisor_test$function$
;

-- DROP FUNCTION public.google_db_advisor_workload_advisory_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_workload_advisory_impl()
 RETURNS SETOF record
 LANGUAGE c
 STABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_workload_advisory_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_workload_columnar_report_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_workload_columnar_report_impl()
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_workload_columnar_report_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_workload_report_detail_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_workload_report_detail_impl()
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_workload_report_detail_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_workload_report_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_workload_report_impl()
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_workload_report_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_workload_statements_impl();

CREATE OR REPLACE FUNCTION public.google_db_advisor_workload_statements_impl()
 RETURNS SETOF record
 LANGUAGE c
 IMMUTABLE STRICT
AS '$libdir/google_db_advisor', $function$google_db_advisor_workload_statements_impl$function$
;

-- DROP FUNCTION public.google_db_advisor_write_catalog_auto_config(text);

CREATE OR REPLACE FUNCTION public.google_db_advisor_write_catalog_auto_config(auto_config text)
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/google_db_advisor', $function$google_db_advisor_write_catalog_auto_config$function$
;

-- DROP FUNCTION public.hypopg(out text, out oid, out oid, out int4, out bool, out int2vector, out oidvector, out oidvector, out oidvector, out pg_node_tree, out pg_node_tree, out oid);

CREATE OR REPLACE FUNCTION public.hypopg(OUT indexname text, OUT indexrelid oid, OUT indrelid oid, OUT innatts integer, OUT indisunique boolean, OUT indkey int2vector, OUT indcollation oidvector, OUT indclass oidvector, OUT indoption oidvector, OUT indexprs pg_node_tree, OUT indpred pg_node_tree, OUT amid oid)
 RETURNS SETOF record
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg$function$
;

-- DROP FUNCTION public.hypopg_create_index(in text, out oid, out text);

CREATE OR REPLACE FUNCTION public.hypopg_create_index(sql_order text, OUT indexrelid oid, OUT indexname text)
 RETURNS SETOF record
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_create_index$function$
;

-- DROP FUNCTION public.hypopg_drop_index(oid);

CREATE OR REPLACE FUNCTION public.hypopg_drop_index(indexid oid)
 RETURNS boolean
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_drop_index$function$
;

-- DROP FUNCTION public.hypopg_get_indexdef(oid);

CREATE OR REPLACE FUNCTION public.hypopg_get_indexdef(indexid oid)
 RETURNS text
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_get_indexdef$function$
;

-- DROP FUNCTION public.hypopg_relation_size(oid);

CREATE OR REPLACE FUNCTION public.hypopg_relation_size(indexid oid)
 RETURNS bigint
 LANGUAGE c
 STRICT COST 100
AS '$libdir/hypopg', $function$hypopg_relation_size$function$
;

-- DROP FUNCTION public.hypopg_reset();

CREATE OR REPLACE FUNCTION public.hypopg_reset()
 RETURNS void
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg_reset$function$
;

-- DROP FUNCTION public.hypopg_reset_index();

CREATE OR REPLACE FUNCTION public.hypopg_reset_index()
 RETURNS void
 LANGUAGE c
 COST 100
AS '$libdir/hypopg', $function$hypopg_reset_index$function$
;