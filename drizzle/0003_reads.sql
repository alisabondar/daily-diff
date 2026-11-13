CREATE TABLE `reads` (
	`date` text PRIMARY KEY NOT NULL,
	`finished_at` integer,
	`quiz_correct` integer,
	`quiz_total` integer
);
