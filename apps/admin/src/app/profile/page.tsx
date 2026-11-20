import { ProfilePage } from "../../features/account";
import { AccessGate } from "../../features/account";

export default function Page() { return <AccessGate><ProfilePage /></AccessGate>; }
