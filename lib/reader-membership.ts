export const READER_MEMBERSHIP_TIERS = [
  { value: "free", label: "Free" },
  { value: "premium", label: "Premium" },
  { value: "vip", label: "VIP" },
] as const;

export type ReaderMembershipTier = (typeof READER_MEMBERSHIP_TIERS)[number]["value"];
