import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("api/positions", "routes/api.positions.ts"),
  route("api/trigger-push", "routes/api.trigger-push.ts"),
  route("api/subscribe", "routes/api.subscribe.ts"),
  route("api/test-notification", "routes/api.test-notification.tsx"),
] satisfies RouteConfig;