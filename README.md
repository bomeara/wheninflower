# Flowering Observations Map

Simple static page that queries the iNaturalist API for plant observations annotated as `Flowers` within the previous two weeks and displays them on a Leaflet map.

Usage:

1. Open `index.html` in a web browser (no build step required).
2. Enter or select a species name using the autocomplete box.
3. Optionally set the "From" and "To" dates to choose the observation time window (defaults to a recent range ending today).
4. Click "Show on Map" — markers will appear for observations annotated as "Flowers" in the chosen date range.

Notes:
- Uses iNaturalist controlled term id `12` and term value `13` (Flowers). If you need other phenology states, adjust `term_id` / `term_value_id` in `app.js`.
- The app requests up to 200 observations via the public iNaturalist API and respects their API terms.

Created with a small static web page using HTML, CSS, JavaScript, and Leaflet.
This page was built in VS Code with assistance from GitHub Copilot using the Raptor mini (Preview) model.
