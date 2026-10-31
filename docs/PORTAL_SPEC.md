# b2btourportal.com — observed spec (logged in as A Link Tour & Travels, 31 Oct 2026)

## Layout
- AdminLTE: dark navy left sidebar (logo top), blue gradient top bar "Welcome to DMC's TOUR PORTAL", right: chat, messages, Theme (Blue/Green/Indigo/Pink/Light/Dark), avatar.
- Menu: Dashboard · Compose Package · Hotel List · My Bookings · Group Query · Offer Packages · Discount List · Promotional List · Customer Care · Make Payment Online · (Margin) · Change Password · My Profile · Logout. WhatsApp/FB/Insta icons bottom of sidebar.

## Dashboard (AgentDashboard.aspx)
- This Year: Total / Underprocess / Confirmed / Rejected pills (dark/blue/green/red). This Month same.
- "Search Generated Packages" from–to date → table PACKAGES ADDED (range):
  Query (query no badge, Margin input + Update, chat btn) | Package_Name (Client Package name, editable Package Name + Save, date | time)
  | Package (View with pics btn, Confirm = send to admin) | Summary (badges: N Nights & M Days, Destination, Pick, Drop, Amount)
  | Admin (Admin Note readonly, Admin Confirmation Pending/Confirmed/Rejected) | Agent (Agent Note textarea, Agent Confirmation).

## Compose Package (PackageCalculatorAgent.aspx)
1. Choose State card (image + "Create") e.g. "Jammu Kashmir and Ladakh Destination".
2. Choose package destination cards (image + "Compose Package"): Kashmir Tour Packages, Ladakh (Leh), Mata Vaishno Devi (Darshan only), Kashmir + Vaishno Devi, Kashmir with Leh (pickup Srinagar drop Leh).
3. CREATE NEW PACKAGE form (all fields with (i) tooltips):
   - CLIENT DETAILS: Client Name | Pick Up Point (select, per destination) | Drop Down Point (select)
   - TOUR DATES & PERSONS: Arrival Date (min today) | Departure Date (min arrival+2, max arrival+9; arrival alone defaults to +2) | Total Days readonly "5 Nights & 6 Days"
   - PERSONS & ROOMS: Adult Persons | Adults (Above 10 Years) [extra-bed persons] | Kid (05 to 10 Years) [no bed] | Total Persons (ro)
     Rooms Required (auto floor(adults/2), min 1) | Extra Beds (auto adults-2*rooms + above10) | Child (No Bed) (auto = kids) | Meal Plan MAP/CP radio
   - VEHICLE SELECTION table: Sno | Vehicle select (Sedan, Innova/Ertiga, Innova Crysta, Tempo 13/17/20, Urbania 16) | Without AC / AC radio | (+) add row, (x) remove
   - TOUR DAYS: one row per day, header "Day N" circle + date "20 Nov 26"
     Place to Visit select (places starting from yesterday's night city; day 1 = arrival places from pickup city) + [Images] [Details]
     Night Stay select (night-stay locations of that place e.g. Gulmarg/Tangmarg) | Hotel Category (categories having hotels there)
     | Hotel (searchable) | Room Type (from hotel's rates). Same night stay as previous day → copies category/hotel/room.
     Last day: Place = "<city> Drop" + drop point label (no hotel).
     Images = hotel photo carousel; Details = hotel description modal.
   - TOUR INCLUSIONS: checkbox chips (some pre-ticked). TOUR EXCLUSIONS: ✖ list. Unticked inclusions get appended to exclusions in final package.
   - Include GST checkbox | Margin Amount | I agree to the terms → Calculate & Save → appears in Dashboard list.

## Package view / PDF (PackageDetail.aspx?Id=…)
- "Download Itinerary (PDF)" button.
- Navy hero card: agent details (logo circle, Name, Company, Address, Email, Phone, Phone 2) | PACKAGE: Client name, Arrival, Departure, Query No, Confirmation No; gold circle "Package Cost 41396.5".
- WHERE YOU WILL GO — Destination: long description of the destination.
- AT A GLANCE — Tour Overview: duration + Adults/Rooms/Children/Extra beds/Kids/CNB grid + photo; strip "VEHICLE | BREAKFAST AND DINNER".
- TOUR DETAIL: per day two columns: left "DAILY ITINERARY DAY 01 (11 Nov 26)" + place photo + DESTINATION (place title) + ABOUT THIS STOP (long description, notes);
  right "ACCOMMODATION NIGHT STAY" hotel main photo + 3 thumbnails + OVERNIGHT LOCATION + HOTEL + ROOM TYPE.
  Last day: bus icon, "DAY 05 DROP-OFF", drop point + drop text.
- GETTING AROUND — Transport: Vehicle | Transport (Without AC).
- WHAT IS COVERED — Package Includes: "MAP - Breakfast and Dinner" + ✓ list. WHAT IS NOT COVERED — numbered 01.. list (+ unticked inclusions).
- COST BREAKDOWN — "Dear Guest, your total package cost amounts to X. This price covers accommodations, package and transport…"
- PAYMENT INFORMATION — Bank name, account name, number, IFSC, UPI mobile (from agent profile).
- Terms & Conditions: validity, info for clients, booking policy, cancellation policy, check-in policy, payment policy. "Thank You".

## Other pages
- Hotel List: Select State, search by Place / Hotel Name, 2-col cards (photo, name, Images, Description), paginated 12.
- My Bookings: stat tiles This Week / Month / Year / Total, From–To + Get Bookings, Booking Details table.
- Group Query: Package Category, Destination, Pickup, Drop, Date of Travel, No. of Days, No. of Persons, Vehicle, Note, Other Information → Send Query.
- Offer Packages: select state → poster image grid. Discount List / Promotional List: rich text rate charts (2/4/6/12 pax per person by hotel category).
- Customer Care: phone numbers, WhatsApp, support/sales email. Make Payment: bank details. Margin: default margin %. My Profile: personal, business (company, GST, website), contact, address, banking (shown on package).
