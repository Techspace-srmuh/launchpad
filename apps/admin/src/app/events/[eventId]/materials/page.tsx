import { AdminEventMaterials } from "../../../../features/event-materials";
import { AccessGate } from "../../../../features/account";

export default function Page() { return <AccessGate admin><AdminEventMaterials /></AccessGate>; }
