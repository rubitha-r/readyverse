/**
 * ReadyVerse - Official Disaster Preparedness Source Mappings (Prompt 6)
 * Single source of truth for all NDMA / NIDM / UNDRR reference citations.
 * Any reference requiring external confirmation is explicitly marked with "NEEDS REVIEW".
 */

(function (root, factory) {
    if (typeof define === "function" && define.amd) {
        define([], factory);
    } else if (typeof module === "object" && module.exports) {
        module.exports = factory();
    } else {
        root.ReadyVerseSources = factory();
        root.READYVERSE_SOURCES = root.ReadyVerseSources;
    }
}(typeof self !== "undefined" ? self : this, function () {
    "use strict";

    const LESSON_SOURCES = {
        fire: {
            id: "fire",
            name: "Fire Safety & Evacuation",
            authority: "NDMA / NBC",
            documentName: "National Disaster Management Guidelines: Scaling, Type & Siting of Fire Stations and Equipment (2012) & National Building Code of India (NBC 2016, Part 4: Fire & Life Safety)",
            shortCitation: "NDMA Guidelines on Fire Safety & NBC 2016 Part 4",
            url: "https://ndma.gov.in/",
            status: "VERIFIED"
        },
        flood: {
            id: "flood",
            name: "Flood Preparedness & Survival",
            authority: "NDMA / NIDM",
            documentName: "National Disaster Management Guidelines: Management of Floods (2008) & NIDM Training Manual on Flood Risk Mitigation",
            shortCitation: "NDMA Guidelines on Management of Floods (2008)",
            url: "https://ndma.gov.in/",
            status: "VERIFIED"
        },
        cyclone: {
            id: "cyclone",
            name: "Cyclone Readiness & Tracking",
            authority: "NDMA / IMD",
            documentName: "National Disaster Management Guidelines: Management of Cyclones (2008) & India Meteorological Department Early Warning Protocols",
            shortCitation: "NDMA Guidelines on Management of Cyclones (2008)",
            url: "https://ndma.gov.in/",
            status: "VERIFIED"
        },
        earthquake: {
            id: "earthquake",
            name: "Earthquake Safety: Drop, Cover, Hold",
            authority: "NDMA / UNDRR",
            documentName: "National Disaster Management Guidelines: Management of Earthquakes (2007) & UNDRR / Global Drop, Cover, and Hold On Standards",
            shortCitation: "NDMA Guidelines on Management of Earthquakes (2007)",
            url: "https://ndma.gov.in/",
            status: "VERIFIED"
        },
        electrical: {
            id: "electrical",
            name: "Electrical Hazards & Safety",
            authority: "CEA / NDMA",
            documentName: "Central Electricity Authority (Measures Relating to Safety and Electric Supply) Regulations (2010) & NDMA Guidelines on Non-Structural Safety in Buildings",
            shortCitation: "CEA Safety Regulations (2010) & NDMA Non-Structural Guidelines (NEEDS REVIEW)",
            url: "https://cea.nic.in/",
            status: "NEEDS REVIEW"
        },
        firstaid: {
            id: "firstaid",
            name: "Emergency First Aid & CPR Essentials",
            authority: "Indian Red Cross / NDMA",
            documentName: "Indian Red Cross Society First Aid Manual & NDMA Basic Life Support / Community First Responder Protocols",
            shortCitation: "Indian Red Cross Society & NDMA Basic Life Support Guidelines (NEEDS REVIEW)",
            url: "https://www.indianredcross.org/",
            status: "NEEDS REVIEW"
        }
    };

    const DRILL_SOURCES = {
        fire: {
            drillId: "fire",
            drillTitle: "Building Fire",
            authority: "NDMA / NBC",
            documentName: "NDMA Guidelines on Fire Safety (2012) & National Building Code of India (NBC 2016 Part 4: Fire & Life Safety)",
            shortCitation: "NDMA Guidelines on Fire Safety & NBC 2016 Part 4",
            debriefSummary: "Evacuation protocols, smoke-layer egress, and structural compartmentation based on NDMA Fire Safety and NBC 2016 Life Safety norms.",
            status: "VERIFIED"
        },
        flood: {
            drillId: "flood",
            drillTitle: "Flash Flood",
            authority: "NDMA / NIDM",
            documentName: "NDMA Guidelines on Management of Floods (2008) & NIDM Swiftwater Survival Guidelines",
            shortCitation: "NDMA Guidelines on Management of Floods (2008)",
            debriefSummary: "Vertical evacuation and flash flood safety rules based on NDMA Flood Management Standards.",
            status: "VERIFIED"
        },
        cyclone: {
            drillId: "cyclone",
            drillTitle: "Cyclone Emergency",
            authority: "NDMA / IMD",
            documentName: "NDMA Guidelines on Management of Cyclones (2008) & IMD Cyclone Early Warning Protocols",
            shortCitation: "NDMA Guidelines on Management of Cyclones (2008)",
            debriefSummary: "Interior shelter, structural barrier protection, and flying debris avoidance aligned with NDMA Cyclone Response protocols.",
            status: "VERIFIED"
        },
        earthquake: {
            drillId: "earthquake",
            drillTitle: "Earthquake Response",
            authority: "NDMA / UNDRR",
            documentName: "NDMA Guidelines on Management of Earthquakes (2007) & UNDRR Sendai Framework for Disaster Risk Reduction (2015-2030)",
            shortCitation: "NDMA Guidelines on Management of Earthquakes (2007)",
            debriefSummary: "Drop, Cover, and Hold On protocols and open-ground assembly procedures aligned with NDMA Seismic Safety guidelines.",
            status: "VERIFIED"
        },
        daily: {
            drillId: "daily",
            drillTitle: "60-Second Daily Drill",
            authority: "NDMA / UNDRR",
            documentName: "NDMA Multi-Hazard Disaster Preparedness Framework & UNDRR Sendai Framework for Disaster Risk Reduction (2015-2030)",
            shortCitation: "NDMA Multi-Hazard Disaster Framework & UNDRR Sendai Framework (NEEDS REVIEW)",
            debriefSummary: "Multi-hazard split-second decision rules synthesized across NDMA Core Guidelines and UNDRR youth disaster resilience standards.",
            status: "NEEDS REVIEW"
        }
    };

    return {
        lessonSources: LESSON_SOURCES,
        drillSources: DRILL_SOURCES,
        getLessonSource(lessonId) {
            return LESSON_SOURCES[lessonId] || {
                shortCitation: "NDMA / NIDM Disaster Preparedness Framework (NEEDS REVIEW)",
                documentName: "National Disaster Management Guidelines (NEEDS REVIEW)",
                status: "NEEDS REVIEW"
            };
        },
        getDrillSource(drillId) {
            return DRILL_SOURCES[drillId] || {
                shortCitation: "NDMA Multi-Hazard Emergency Protocols (NEEDS REVIEW)",
                documentName: "National Disaster Management Guidelines (NEEDS REVIEW)",
                status: "NEEDS REVIEW"
            };
        }
    };
}));
