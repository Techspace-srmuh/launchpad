import { EventEditor } from "../../../features/events";
import { AccessGate } from "../../../features/account";

export default function Page() { return <AccessGate admin><EventEditor /></AccessGate>; }
