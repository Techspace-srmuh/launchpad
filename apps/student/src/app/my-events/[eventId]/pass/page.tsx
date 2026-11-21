import { AccessGate } from "../../../../features/account";
import { StudentEventPass } from "../../../../features/pass";

export default function Page() { return <AccessGate><StudentEventPass /></AccessGate>; }
