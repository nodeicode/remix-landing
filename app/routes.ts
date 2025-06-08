import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/index.tsx"),
  route("/myWork", "routes/myWork.tsx"),
  route("/projects", "routes/projects.tsx"),
] satisfies RouteConfig;