import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("dashboard", "routes/dashboard.tsx"),
  route("api/positions", "routes/api.positions.ts"),
  route("api/trigger-push", "routes/api.trigger-push.ts"),
  route("api/subscribe", "routes/api.subscribe.ts"),
  route("api/cleanup-subscriptions", "routes/api.cleanup-subscriptions.ts"),
] satisfies RouteConfig;