"use client";
import { Guard } from "@/components/auth";
import { PackagesBoard } from "@/components/packages-board";

export default function PackagesPage() {
  return <Guard module="itineraries"><PackagesBoard /></Guard>;
}
