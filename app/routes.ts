import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("api/positions", "routes/api.positions.ts"),
] satisfies RouteConfig;