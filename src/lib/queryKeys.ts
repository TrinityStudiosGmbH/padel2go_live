// Centralized query keys for React Query - prevents typos and enables easy refactoring
// All query keys should be defined here and imported where needed

export const QUERY_KEYS = {
  // Admin queries
  adminLocations: "admin-locations-with-courts",
  adminLocationsFilter: "admin-locations-filter",
  adminBookings: "admin-bookings",
  adminWeekBookings: "admin-week-bookings",
  adminEvents: "admin-events",
  adminUsers: "admin-all-users",
  
  // User queries
  userBookings: "user-bookings",
  account: "account",
  
  // Public queries
  locations: "locations",
  events: "events",
  publicEvents: "public-events",
  dashboardEvents: "dashboard-events",
  eventDetail: "event-detail",
  similarEvents: "similar-events",
  
  // Rewards system
  rewards: "rewards",
  rewardsSummary: "rewards-summary",
  rewardsList: "rewards-list",
  
  // P2G Points system (consolidated from useP2GPoints)
  p2g: "p2g-points",
  p2gSummary: "p2g-points-summary",
  p2gRewards: "p2g-points-rewards",
  p2gSkills: "p2g-points-skills",
  p2gLedger: "p2g-points-ledger",
  p2gStreaks: "p2g-points-streaks",
  p2gFeed: "p2g-points-feed",
  p2gLastGame: "p2g-points-last-game",
  p2gRankings: "p2g-points-rankings",
  p2gSkillLast5: "p2g-skill-last5",
  p2gCreditBreakdown: "p2g-credit-breakdown",
  p2gDailyClaimStatus: "p2g-daily-claim-status",
  p2gWLStats: "p2g-wl-stats",
  
  // Marketplace
  marketplaceItems: "marketplace-items",
  marketplaceRedemptions: "marketplace-redemptions",
  
  // Site configuration
  siteVisuals: "site-visuals",
  siteVisual: "site-visual",
  siteSettings: "site-settings",
  pointsValue: "points-value",
  
  // Notifications
  notifications: "notifications",
  
  // Court pricing
  globalPrices: "global-prices",
  locationMinPrice: "location-min-price",
  
  // Booking
  booking: "booking",
  bookingCheckout: "booking-checkout",
  
  // Lobbies
  lobbies: "lobbies",
  lobbyDetail: "lobby-detail",
  myLobbies: "my-lobbies",
} as const;

export type QueryKey = (typeof QUERY_KEYS)[keyof typeof QUERY_KEYS];

// Helper to create compound query keys with parameters
export const createQueryKey = <T extends QueryKey>(
  key: T,
  ...params: (string | number | undefined | null)[]
) => [key, ...params.filter((p) => p !== undefined && p !== null)] as const;
