// Synthetic, deliberately stable fixtures. No real attendance or guest data.
export const concertsData = { dismissedSuggestions: [], concerts: [
  ...Array.from({ length: 48 }, (_, index) => ({ artist: `EXAMPLE ARTIST ${String(index+1).padStart(2,"0")}`, venue: `EXAMPLE VENUE ${index%6+1}`, city: index%2 ? "Barcelona" : "Lausanne", country: index%2 ? "ES" : "CH", date: `15/06/${2000+index%25}`, bought: true, ...(index<2 ? {festival:"EXAMPLE FESTIVAL"} : {}) })),
  ...["13/05/2017","05/11/2018","19/04/2007"].map((date)=>({artist:"RIVERSIDE",venue:"SALA SALAMANDRA",city:"L’Hospitalet de Llobregat",country:"ES",date,bought:true})),
  ...["17/08/2026","18/08/2026","10/10/2026","06/11/2026","22/11/2026","10/02/2027"].map((date,index)=>({artist:`UPCOMING EXAMPLE ${index+1}`,venue:"EXAMPLE VENUE WITH A LONG NAME",city:"Barcelona",country:"ES",date,bought:index%2===0})),
] };
export const suggestionsData = { generatedAt:"2026-08-17T10:00:00Z", suggestions:Array.from({length:5},(_,index)=>({id:`example-suggestion-${index}`,artist:`SUGGESTED EXAMPLE ${index+1}`,venue:"EXAMPLE VENUE",city:"Barcelona",country:"ES",date:`${String(index+1).padStart(2,"0")}/12/2026`,source:"Example",sourceUrl:"https://example.org/event"})) };
