import {
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  real,
  integer,
  jsonb,
  varchar,
} from "drizzle-orm/pg-core";

/**
 * Every inference request. PRIVACY: raw text / exact GPS / identity fields are NOT stored
 * (only request_id, modality flags, predictions, and coarse provenance) unless LOG_RAW_TEXT=true.
 */
export const predictions = pgTable("predictions", {
  id: serial("id").primaryKey(),
  requestId: varchar("request_id", { length: 64 }).notNull().unique(),
  endpoint: varchar("endpoint", { length: 64 }).notNull(),
  modelVersion: varchar("model_version", { length: 64 }).notNull(),
  fusionVersion: varchar("fusion_version", { length: 64 }).notNull(),
  textAvailable: boolean("text_available").notNull().default(false),
  imageAvailable: boolean("image_available").notNull().default(false),
  structuredAvailable: boolean("structured_available").notNull().default(false),
  sensorAvailable: boolean("sensor_available").notNull().default(false),
  locationAvailable: boolean("location_available").notNull().default(false),
  disasterType: varchar("disaster_type", { length: 64 }),
  disasterTypeConfidence: real("disaster_type_confidence"),
  informative: varchar("informative", { length: 32 }),
  informativeConfidence: real("informative_confidence"),
  humanitarianCategory: varchar("humanitarian_category", { length: 96 }),
  humanitarianConfidence: real("humanitarian_confidence"),
  damageSeverity: varchar("damage_severity", { length: 32 }),
  damageSeverityConfidence: real("damage_severity_confidence"),
  responsePriority: varchar("response_priority", { length: 16 }),
  priorityConfidence: real("priority_confidence"),
  overallConfidence: real("overall_confidence"),
  requiresHumanReview: boolean("requires_human_review").notNull().default(false),
  reviewReasons: jsonb("review_reasons").$type<string[]>().notNull().default([]),
  reviewStatus: varchar("review_status", { length: 24 }).notNull().default("pending"),
  latencyMs: integer("latency_ms").notNull().default(0),
  response: jsonb("response").notNull(),
  rawTextLogged: text("raw_text_logged"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Model registry: each trained/exported artefact with its metadata card. */
export const modelRegistry = pgTable("model_registry", {
  id: serial("id").primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  version: varchar("version", { length: 64 }).notNull().unique(),
  layer: varchar("layer", { length: 8 }).notNull(), // A | B
  architecture: text("architecture").notNull(),
  datasetVersion: varchar("dataset_version", { length: 96 }).notNull(),
  trainingTimestamp: varchar("training_timestamp", { length: 64 }),
  status: varchar("status", { length: 32 }).notNull(), // deployed | rule_based | not_trained
  calibrationStatus: varchar("calibration_status", { length: 64 }).notNull(),
  metrics: jsonb("metrics").notNull().default({}),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * Future JanRakshak training extension (section 28). Only human-verified rows may ever be used
 * for fine-tuning. Model output is NEVER auto-promoted to a label.
 */
export const verifiedTrainingRecords = pgTable("verified_janrakshak_dataset", {
  id: serial("id").primaryKey(),
  reportId: varchar("report_id", { length: 64 }).notNull(),
  requestId: varchar("request_id", { length: 64 }),
  text: text("text"),
  imageRef: text("image_ref"),
  disasterType: varchar("disaster_type", { length: 64 }),
  humanitarianCategory: varchar("humanitarian_category", { length: 96 }),
  damageSeverity: varchar("damage_severity", { length: 32 }),
  responsePriority: varchar("response_priority", { length: 16 }),
  modelFeatures: jsonb("model_features").notNull().default({}),
  humanVerified: boolean("human_verified").notNull().default(true),
  verifiedBy: varchar("verified_by", { length: 64 }),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

/** Lightweight API metrics counters (section 58). */
export const apiMetrics = pgTable("api_metrics", {
  id: serial("id").primaryKey(),
  endpoint: varchar("endpoint", { length: 64 }).notNull(),
  status: integer("status").notNull(),
  latencyMs: integer("latency_ms").notNull(),
  lowConfidence: boolean("low_confidence").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
