import { StudentEvents } from "../../features/events";
import { AccessGate } from "../../features/account";

export default function Page() { return <AccessGate><StudentEvents mine /></AccessGate>; }
