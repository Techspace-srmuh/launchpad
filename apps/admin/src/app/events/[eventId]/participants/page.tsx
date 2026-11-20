import { EventParticipants } from "../../../../features/events";
import { AccessGate } from "../../../../features/account";

export default function Page() { return <AccessGate admin><EventParticipants /></AccessGate>; }
