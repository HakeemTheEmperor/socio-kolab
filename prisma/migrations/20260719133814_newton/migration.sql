-- DropForeignKey
ALTER TABLE "Attendance" DROP CONSTRAINT "Attendance_membershipId_fkey";

-- AddForeignKey
ALTER TABLE "Attendance" ADD CONSTRAINT "Attendance_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE SET NULL ON UPDATE CASCADE;
