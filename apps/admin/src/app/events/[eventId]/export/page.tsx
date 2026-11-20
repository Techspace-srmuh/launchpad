import { ParticipantExport } from "../../../../features/participant-export";
import { AccessGate } from "../../../../features/account";
export default function Page() { return <AccessGate admin><ParticipantExport /></AccessGate>; }
