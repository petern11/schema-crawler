const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const { parse } = require('json2csv');
const path = require('path');

// Get command line argument
const locale = process.argv[2];
if (!locale) {
    console.error('Please provide a locale identifier (e.g., node index.js nl-be)');
    process.exit(1);
}

async function loadUrls(locale) {
    try {
        const urlsFile = `./site-urls/${locale}-urls.js`;
        const urls = require(urlsFile);
        
        if (!Array.isArray(urls)) {
            throw new Error(`URLs file ${urlsFile} must export an array`);
        }
        
        return urls;
    } catch (error) {
        console.error(`Error loading URLs file for ${locale}:`, error.message);
        process.exit(1);
    }
}

async function crawlSites(sites) {
    // Group results by schema type
    const resultsByType = new Map();
    
    for (const site of sites) {
        try {
            console.log(`Crawling ${site}...`);
            const response = await axios.get(site);
            const $ = cheerio.load(response.data);
            
            const schemaScripts = $('script[type="application/ld+json"]');
            
            if (schemaScripts.length === 0) {
                addToResults(resultsByType, 'NoSchema', {
                    sourceUrl: site,
                    schemaFound: false,
                    errorMessage: 'No schema markup found'
                });
                continue;
            }
            
            schemaScripts.each((_, element) => {
                try {
                    const schema = JSON.parse($(element).html());
                    const schemaType = getSchemaType(schema);
                    
                    const flattened = {
                        sourceUrl: site,
                        schemaFound: true,
                        errorMessage: '',
                        ...flattenObject(schema)
                    };
                    
                    addToResults(resultsByType, schemaType, flattened);
                } catch (parseError) {
                    addToResults(resultsByType, 'ParseError', {
                        sourceUrl: site,
                        schemaFound: false,
                        errorMessage: `Parse error: ${parseError.message}`
                    });
                }
            });
        } catch (error) {
            addToResults(resultsByType, 'CrawlError', {
                sourceUrl: site,
                schemaFound: false,
                errorMessage: `Crawl error: ${error.message}`
            });
        }
    }
    
    return resultsByType;
}

function getSchemaType(schema) {
    const type = schema['@type'];
    if (!type) return 'UnknownType';
    return Array.isArray(type) ? type[0] : type;
}

function addToResults(resultsByType, type, data) {
    if (!resultsByType.has(type)) {
        resultsByType.set(type, []);
    }
    resultsByType.get(type).push(data);
}

async function saveResultsByType(locale, resultsByType) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputDir = path.join('./output', locale, timestamp);
    await fs.mkdir(outputDir, { recursive: true });
    
    const summary = {
        totalUrls: 0,
        typeBreakdown: {}
    };
    
    for (const [type, results] of resultsByType.entries()) {
        if (results.length === 0) continue;
        
        const fields = ['sourceUrl', 'schemaFound', 'errorMessage', 
            ...new Set(results.flatMap(obj => Object.keys(obj)))
        ];
        
        const csv = parse(results, { fields });
        const filename = path.join(outputDir, `${type}.csv`);
        await fs.writeFile(filename, csv);
        
        summary.totalUrls += results.length;
        summary.typeBreakdown[type] = results.length;
    }
    
    // Save summary
    await fs.writeFile(
        path.join(outputDir, 'summary.json'),
        JSON.stringify(summary, null, 2)
    );
    
    return { outputDir, summary };
}

// Helper function to flatten nested objects
function flattenObject(obj, prefix = '') {
    const flattened = {};
    
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            const value = obj[key];
            const newKey = prefix ? `${prefix}.${key}` : key;
            
            if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                Object.assign(flattened, flattenObject(value, newKey));
            } else {
                flattened[newKey] = Array.isArray(value) ? JSON.stringify(value) : value;
            }
        }
    }
    
    return flattened;
}

async function main() {
    try {
        const sites = await loadUrls(locale);
        console.log(`Loaded ${sites.length} URLs for locale: ${locale}`);
        
        const resultsByType = await crawlSites(sites);
        const { outputDir, summary } = await saveResultsByType(locale, resultsByType);
        
        console.log(`\nResults saved to: ${outputDir}`);
        console.log('\nSummary:');
        console.log(`Total URLs processed: ${summary.totalUrls}`);
        console.log('\nBreakdown by schema type:');
        Object.entries(summary.typeBreakdown)
            .forEach(([type, count]) => console.log(`${type}: ${count}`));
            
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

main();