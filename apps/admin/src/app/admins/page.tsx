import { AccessGate } from "../../features/account";
import { AdminAccessPage } from "../../features/admins";

export default function Page() {
  return <AccessGate admin><AdminAccessPage /></AccessGate>;
}
