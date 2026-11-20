import { AttendanceScanner } from "../../../../features/attendance";
import { AccessGate } from "../../../../features/account";

export default function Page() {
  return (
    <AccessGate admin>
      <AttendanceScanner />
    </AccessGate>
  );
}
