import { StudentAnnouncements } from "../../features/announcements";
import { AccessGate } from "../../features/account";

export default function Page() { return <AccessGate><StudentAnnouncements /></AccessGate>; }
