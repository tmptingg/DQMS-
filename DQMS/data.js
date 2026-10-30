// ========================================
// BASICALLY ALL PRESET DATA
// ========================================

// Shortcut for preset timestamps: T(day, hour24, minute) on October 2026
const T = (day, h, m) => new Date(2026, 9, day, h, m).getTime();

const DQMS_DATA = {
  // Bump this whenever the preset data changes. A saved session from an older version is discarded,
  // so old numbers never come back over the new presets.
  version: "2026.11.02-r6",
  terminal: { name: "Metro PUV Terminal", bay: "Bay 01" },

  // ========================================
  // SIGN-IN ACCOUNTS
  // ========================================
  // Dispatchers are tied to a dispatcher id below. The admin sees everything.
  accounts: [
    { email: "stevie.g@gmail.com", password: "pass1", phone: "09183746052", role: "dispatcher", dispatcherId: "disp1" },
    { email: "kenny.d@gmail.com", password: "pass3", phone: "09465820173", role: "dispatcher", dispatcherId: "disp2" },
    { email: "jamie.c@gmail.com", password: "pass2", phone: "09277134958", role: "dispatcher", dispatcherId: "disp3" },
    { email: "coop.o@gmail.com", password: "password321", name: "Admin", phone: "09608512479", role: "coop" }
  ],

  // ========================================
  // ROUTES AND PLACES
  // ========================================
  destinations: [
    { name: "Hagonoy", province: "Bulacan" },
    { name: "Calumpit", province: "Bulacan" },
    { name: "Marilao", province: "Bulacan" },
    { name: "Meycauayan", province: "Bulacan" },
    { name: "Bulakan / Mambog (MMB JODA)", province: "Bulacan" },
    { name: "Apalit", province: "Pampanga" },
    { name: "Pulilan", province: "Bulacan" },
    { name: "Sta. Maria", province: "Bulacan" },
    { name: "Muzon / San Jose del Monte (SJDM)", province: "Bulacan" }
  ],

  // ========================================
  // TV DISPLAY
  // ========================================
  // Which places share a screen (nearest to each other).
  tvGroups: [
    ["Marilao", "Bulakan / Mambog (MMB JODA)", "Meycauayan"],
    ["Calumpit", "Apalit", "Hagonoy"],
    ["Pulilan", "Sta. Maria", "Muzon / San Jose del Monte (SJDM)"]
  ],
  tvDelaySeconds: 10,          // default seconds per TV screen (Admin can change it)

  // ========================================
  // TOAST
  // ========================================
  // The top banner. Success and error use toastSeconds, "Coming Soon" uses qrToastSeconds
  toastSeconds: 6,
  qrToastSeconds: 2.5,

  // ========================================
  // LIMITS
  // ========================================
  maxCapacity: 22,             // seats per unit (over this = overloaded)
  maxCounter: 32,              // the dispatcher's passenger counter stops here
  maxPlacesPerDispatcher: 3,   // one dispatcher can ONLY handle up to 3 places
  maxAddressLength: 120,       // incident address charac limit (120 lang)
  maxNameLength: 40,           // driver, dispatcher and admin names

  // ========================================
  // INCIDENT MEDIA PRESETS
  // ========================================
  mediaOptions: [
    "1 JPG",
    "1 PNG",
    "1 MP4",
    "Combination of MP4 and PNG",
    "Combination of JPEG and PNG",
    "No media"
  ],

  // ========================================
  // QUEUE PER DESTINATION
  // ========================================
  // First unit = POS #1 = the one currently loading
  queues: {
    "Hagonoy": [
      { plate: "XYZ-9876", driver: "Sergio Busquets", pax: 18, arrivedTs: T(22, 1, 20), loadedTs: T(22, 1, 48) },
      { plate: "ABC-1234", driver: "Xavi Hernandez", pax: 0, arrivedTs: T(22, 1, 35) },
      { plate: "DEF-5678", driver: "Andres Iniesta", pax: 0, arrivedTs: T(22, 1, 52) },
      { plate: "GHI-9012", driver: "Carles Puyol", pax: 0, arrivedTs: T(22, 2, 1) },
      { plate: "JKL-3456", driver: "Gerard Pique", pax: 0, arrivedTs: T(22, 2, 8) },
      { plate: "MNO-7890", driver: "Seydou Keita", pax: 0, arrivedTs: T(22, 2, 15) },
      { plate: "PQR-1234", driver: "Dani Alves", pax: 0, arrivedTs: T(22, 2, 19) }
    ],
    "Calumpit": [
      { plate: "STU-2042", driver: "David Villa", pax: 6, arrivedTs: T(22, 1, 58), loadedTs: T(22, 2, 5) },
      { plate: "VWX-3141", driver: "Pedro Rodriguez", pax: 0, arrivedTs: T(22, 2, 11) }
    ],
    "Marilao": [
      { plate: "YZA-5926", driver: "Victor Valdes", pax: 11, arrivedTs: T(22, 1, 40), loadedTs: T(22, 1, 55) }
    ]
  },

  // ========================================
  // TRIP HISTORY (DISPATCHER LOGS)
  // ========================================
  // capacity = the seat limit of that unit at the time of the trip
  // Newest first. Every dispatched trip, with its arrival, loading and dispatch times
  tripLogs: [
    { driver: "Andres Iniesta", plate: "DEF-5678", capacity: 18, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(21, 5, 44), loadedTs: T(21, 5, 55), dispatchedTs: T(21, 6, 8), pax: 21 },
    { driver: "Sergio Busquets", plate: "XYZ-9876", capacity: 22, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(21, 5, 22), loadedTs: T(21, 5, 31), dispatchedTs: T(21, 5, 40), pax: 24 },
    { driver: "Victor Valdes", plate: "YZA-5926", capacity: 22, destination: "Marilao", dispatcherId: "disp2", arrivedTs: T(21, 5, 10), loadedTs: T(21, 5, 24), dispatchedTs: T(21, 5, 38), pax: 22 },
    { driver: "David Villa", plate: "STU-2042", capacity: 24, destination: "Calumpit", dispatcherId: "disp1", arrivedTs: T(21, 5, 1), loadedTs: T(21, 5, 15), dispatchedTs: T(21, 5, 33), pax: 22 },
    { driver: "Xavi Hernandez", plate: "ABC-1234", capacity: 22, destination: "Calumpit", dispatcherId: "disp1", arrivedTs: T(20, 6, 48), loadedTs: T(20, 6, 55), dispatchedTs: T(20, 7, 12), pax: 22 },
    { driver: "Pedro Rodriguez", plate: "VWX-3141", capacity: 18, destination: "Calumpit", dispatcherId: "disp1", arrivedTs: T(20, 5, 58), loadedTs: T(20, 6, 9), dispatchedTs: T(20, 6, 30), pax: 17 },
    { driver: "Xavi Hernandez", plate: "ABC-1234", capacity: 22, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(20, 5, 26), loadedTs: T(20, 5, 34), dispatchedTs: T(20, 5, 50), pax: 20 },
    { driver: "Carles Puyol", plate: "GHI-9012", capacity: 16, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(20, 5, 2), loadedTs: T(20, 5, 12), dispatchedTs: T(20, 5, 24), pax: 22 },
    { driver: "Gerard Pique", plate: "JKL-3456", capacity: 22, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(20, 4, 45), loadedTs: T(20, 4, 58), dispatchedTs: T(20, 5, 2), pax: 19 },
    { driver: "Andres Iniesta", plate: "DEF-5678", capacity: 18, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(19, 6, 2), loadedTs: T(19, 6, 12), dispatchedTs: T(19, 6, 29), pax: 22 },
    { driver: "Dani Alves", plate: "PQR-1234", capacity: 22, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(19, 5, 33), loadedTs: T(19, 5, 50), dispatchedTs: T(19, 6, 5), pax: 19 },
    { driver: "Seydou Keita", plate: "MNO-7890", capacity: 20, destination: "Hagonoy", dispatcherId: "disp1", arrivedTs: T(19, 5, 15), loadedTs: T(19, 5, 27), dispatchedTs: T(19, 5, 46), pax: 22 },
    { driver: "Victor Valdes", plate: "YZA-5926", capacity: 22, destination: "Marilao", dispatcherId: "disp2", arrivedTs: T(19, 4, 58), loadedTs: T(19, 5, 8), dispatchedTs: T(19, 5, 21), pax: 22 }
  ],

  // ========================================
  // COOP ACTIVITY LOGS (ADMIN)
  // ========================================
  // flair = the category tag: STAFF, STRIKE, DRIVER, PLACE, DISPATCH
  // Trip history is merged in from tripLogs, so these are only the cooperation actions
  coopLogs: [
    { ts: T(21, 6, 10), flair: "STRIKE", text: "Overloading report for Sergio Busquets (XYZ-9876) approved. Strike issued." },
    { ts: T(20, 8, 0), flair: "STRIKE", text: "Reckless Driving report for Xavi Hernandez (ABC-1234) dismissed." },
    { ts: T(18, 10, 42), flair: "DRIVER", text: "Pedro Rodriguez (VWX-3141) added to fleet." },
    { ts: T(18, 10, 30), flair: "DRIVER", text: "Victor Valdes (YZA-5926) added to fleet." },
    { ts: T(17, 9, 40), flair: "STAFF", text: "Jamie Carragher (DSP-003) added as dispatcher." },
    { ts: T(17, 9, 25), flair: "PLACE", text: "Marilao, Meycauayan and Bulakan / Mambog assigned to Kenny Dalglish (DSP-002)." },
    { ts: T(17, 9, 20), flair: "STAFF", text: "Kenny Dalglish (DSP-002) added as dispatcher." },
    { ts: T(17, 9, 5), flair: "PLACE", text: "Apalit, Calumpit and Hagonoy assigned to Steven Gerrard (DSP-001)." },
    { ts: T(17, 9, 0), flair: "STAFF", text: "Steven Gerrard (DSP-001) added as dispatcher." }
  ],

  // ========================================
  // FLEET ROSTER
  // ========================================
  // addedTs is used for the "Recently added" sort
  drivers: [
    { name: "Xavi Hernandez", plate: "ABC-1234", capacity: 22, status: "In Good Standing", strikes: 0, addedTs: T(17, 8, 0) },
    { name: "Andres Iniesta", plate: "DEF-5678", capacity: 18, status: "1 Strike", strikes: 1, addedTs: T(17, 8, 0) },
    { name: "Sergio Busquets", plate: "XYZ-9876", capacity: 22, status: "1 Strike", strikes: 1, addedTs: T(17, 8, 0) },
    { name: "Carles Puyol", plate: "GHI-9012", capacity: 16, status: "1 Strike", strikes: 1, addedTs: T(17, 8, 0) },
    { name: "Gerard Pique", plate: "JKL-3456", capacity: 22, status: "In Good Standing", strikes: 0, addedTs: T(17, 8, 0) },
    { name: "Seydou Keita", plate: "MNO-7890", capacity: 20, status: "In Good Standing", strikes: 0, addedTs: T(17, 8, 0) },
    { name: "Dani Alves", plate: "PQR-1234", capacity: 22, status: "In Good Standing", strikes: 0, addedTs: T(17, 8, 0) },
    { name: "David Villa", plate: "STU-2042", capacity: 24, status: "In Good Standing", strikes: 0, addedTs: T(17, 8, 0) },
    { name: "Pedro Rodriguez", plate: "VWX-3141", capacity: 18, status: "In Good Standing", strikes: 0, addedTs: T(18, 10, 42) },
    { name: "Victor Valdes", plate: "YZA-5926", capacity: 22, status: "In Good Standing", strikes: 0, addedTs: T(18, 10, 30) }
  ],

  // ========================================
  // DISPATCHERS
  // ========================================
  // badge = the dispatcher's ID number (auto-assigned in order: DSP-001, DSP-002, ...)
  // places = the places this dispatcher controls (only these can be dispatched from their account)
  dispatchers: [
    { id: "disp1", name: "Steven Gerrard", badge: "DSP-001", places: ["Apalit", "Calumpit", "Hagonoy"] },
    { id: "disp2", name: "Kenny Dalglish", badge: "DSP-002", places: ["Marilao", "Meycauayan", "Bulakan / Mambog (MMB JODA)"] },
    { id: "disp3", name: "Jamie Carragher", badge: "DSP-003", places: [] }
  ],

  // ========================================
  // CITIES / MUNICIPALITIES
  // ========================================
  // For the incident report location search
  cities: [
    { name: "Hagonoy", province: "Bulacan" },
    { name: "Calumpit", province: "Bulacan" },
    { name: "Malolos", province: "Bulacan" },
    { name: "Paombong", province: "Bulacan" },
    { name: "Marilao", province: "Bulacan" },
    { name: "Meycauayan", province: "Bulacan" },
    { name: "Bulakan", province: "Bulacan" },
    { name: "Pulilan", province: "Bulacan" },
    { name: "Plaridel", province: "Bulacan" },
    { name: "Baliuag", province: "Bulacan" },
    { name: "Santa Maria", province: "Bulacan" },
    { name: "San Jose del Monte", province: "Bulacan" },
    { name: "Guiguinto", province: "Bulacan" },
    { name: "Balagtas", province: "Bulacan" },
    { name: "Bocaue", province: "Bulacan" },
    { name: "Obando", province: "Bulacan" },
    { name: "Apalit", province: "Pampanga" },
    { name: "Macabebe", province: "Pampanga" },
    { name: "Guagua", province: "Pampanga" },
    { name: "San Fernando", province: "Pampanga" },
    { name: "Angeles", province: "Pampanga" }
  ],

  // ========================================
  // INCIDENT REPORTS
  // ========================================
  // filedBy = the dispatcher id who filed it, media = one of mediaOptions
  incidents: [
    {
      id: 1, driver: "Xavi Hernandez", plate: "ABC-1234",
      type: "Refusal to Load / Bypass", ts: T(22, 6, 0),
      location: { city: "Marilao", province: "Bulacan", address: "Bay 01 loading lane, Metro PUV Terminal" },
      notes: "Driver refused to load assigned passengers at Bay 1 and departed prematurely.",
      status: "pending", decidedTs: null, filedBy: "disp2", media: "1 JPG"
    },
    {
      id: 2, driver: "Sergio Busquets", plate: "XYZ-9876",
      type: "Overloading", ts: T(21, 5, 40),
      location: { city: "Marilao", province: "Bulacan", address: "Terminal exit gate, Metro PUV Terminal" },
      notes: "Unit left the bay with more than the 22-seat limit.",
      status: "approved", decidedTs: T(21, 6, 10), filedBy: "disp1", media: "Combination of MP4 and PNG"
    },
    {
      id: 3, driver: "Xavi Hernandez", plate: "ABC-1234",
      type: "Reckless Driving", ts: T(20, 7, 15),
      location: { city: "Calumpit", province: "Bulacan", address: "MacArthur Highway, near the public market" },
      notes: "Reported for speeding out of the bay; no witnesses or photo.",
      status: "rejected", decidedTs: T(20, 8, 0), filedBy: "disp1", media: "No media"
    }
  ],

  violationTypes: [
    "Refusal to Load / Bypass",
    "Overloading",
    "Fare Overcharging",
    "Reckless Driving",
    "Unauthorized Departure"
  ],

  // ========================================
  // ANALYTICS (MALOLOS TERMINAL, TODAY)

  // Sample photo shown in the media viewer. Put the file in the media/ folder next to index.html.
  // If the file is missing, the viewer shows "Coming Soon" instead.
  mediaSample: {
    file: "media/sample-jeepney.jpg",
    credit: "Courtesy of Wikimedia Commons (Philippine jeepney). Prototype use only."
  },

  sampleFiles: ["Camera_img_1042.jpg", "IMG_2025.jpg", "VID_1023021.mp4"]
};
