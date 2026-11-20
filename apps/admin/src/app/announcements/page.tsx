import { AdminAnnouncements } from "../../features/announcements";
import { AccessGate } from "../../features/account";

export default function Page() { return <AccessGate admin><AdminAnnouncements /></AccessGate>; }
