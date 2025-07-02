/*
  Warnings:

  - Added the required column `initialAmount` to the `Investment` table without a default value. This is not possible if the table is not empty.
  - Added the required column `startDate` to the `Investment` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Investment" ADD COLUMN     "initialAmount" INTEGER NOT NULL,
ADD COLUMN     "startDate" TIMESTAMP(3) NOT NULL;
