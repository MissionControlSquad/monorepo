-- Buildbase notification cutover: buildbase owns push/email delivery + per-type user preferences.
-- Drop our own push-subscription store and notification-preference table.
DROP TABLE IF EXISTS "push_subscriptions";
DROP TABLE IF EXISTS "user_notification_preferences";
