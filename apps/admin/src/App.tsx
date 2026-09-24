import { Navigate, Route, Routes } from "react-router-dom";
import { entities } from "@sms/crud-engine";
import { Shell } from "./layout/Shell";
import { Dashboard } from "./pages/Dashboard";
import { LookupManager } from "./pages/LookupManager";
import { EntityList } from "./pages/EntityList";
import { EntityForm } from "./pages/EntityForm";
import { PermissionsMatrix } from "./pages/PermissionsMatrix";
import { RuleSimulator } from "./pages/RuleSimulator";
import { EnrolApplication } from "./pages/EnrolApplication";

const entityRoutes = Object.values(entities).map((e) => e.key);

export default function App() {
  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<Dashboard />} />
        <Route path="lookups" element={<LookupManager />} />
        <Route path="iam/permissions" element={<PermissionsMatrix />} />
        <Route path="shared/simulate" element={<RuleSimulator />} />
        <Route path="admission/enrol" element={<EnrolApplication />} />
        {entityRoutes.map((key) => (
          <Route key={`${key}-list`} path={`entities/${key}`} element={<EntityList entityKey={key} />} />
        ))}
        {entityRoutes.map((key) => (
          <Route key={`${key}-new`} path={`entities/${key}/new`} element={<EntityForm entityKey={key} />} />
        ))}
        {entityRoutes.map((key) => (
          <Route
            key={`${key}-edit`}
            path={`entities/${key}/:id`}
            element={<EntityForm entityKey={key} />}
          />
        ))}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
