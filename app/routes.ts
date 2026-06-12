import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("api/positions", "routes/api.positions.ts"),
  route("api/trigger-push", "routes/api.trigger-push.ts"),
  route("api/subscribe", "routes/api.subscribe.ts"),
  route("api/cleanup-subscriptions", "routes/api.cleanup-subscriptions.ts"),
  route("api/test-notification", "routes/api.test-notification.ts"),
  route("api/accounts", "routes/api.accounts.ts"),
  route("api/portfolio-history", "routes/api.portfolio-history.ts"),
  route("api/signals", "routes/api.signals.ts"),
  route("api/config", "routes/api.config.ts"),
] satisfies RouteConfig;