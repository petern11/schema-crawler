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
    const results = [];
    
    for (const site of sites) {
        try {
            console.log(`Crawling ${site}...`);
            const response = await axios.get(site);
            const $ = cheerio.load(response.data);
            
            // Find all script tags with type="application/ld+json"
            const schemaScripts = $('script[type="application/ld+json"]');
            
            if (schemaScripts.length === 0) {
                // If no schema found, add a record with just the URL
                results.push({
                    sourceUrl: site,
                    schemaFound: false,
                    errorMessage: 'No schema markup found'
                });
                console.log(`No schema found for ${site}`);
                continue;
            }
            
            let schemaFoundForSite = false;
            schemaScripts.each((_, element) => {
                try {
                    const schemaText = $(element).html();
                    const schema = JSON.parse(schemaText);
                    
                    // Flatten the schema object for CSV
                    const flattened = flattenObject(schema);
                    // Ensure primary fields come first by creating a new object with desired order
                    const orderedData = {
                        sourceUrl: site,
                        schemaFound: true,
                        errorMessage: '',
                        ...flattened  // Spread the rest of the flattened data after our primary fields
                    };
                    results.push(orderedData);
                    schemaFoundForSite = true;
                } catch (parseError) {
                    console.error(`Error parsing schema for ${site}:`, parseError.message);
                    if (!schemaFoundForSite) {
                        results.push({
                            sourceUrl: site,
                            schemaFound: false,
                            errorMessage: `Parse error: ${parseError.message}`
                        });
                    }
                }
            });
        } catch (error) {
            console.error(`Error crawling ${site}:`, error.message);
            results.push({
                sourceUrl: site,
                schemaFound: false,
                errorMessage: `Crawl error: ${error.message}`
            });
        }
    }
    
    return results;
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
        // Load URLs for the specified locale
        const sites = await loadUrls(locale);
        console.log(`Loaded ${sites.length} URLs for locale: ${locale}`);
        
        // Crawl sites and get schema data
        const results = await crawlSites(sites);
        
        if (results.length === 0) {
            console.log('No data collected.');
            return;
        }
        
        // Get all unique field names and order them
        const primaryFields = ['sourceUrl', 'schemaFound', 'errorMessage'];
        const otherFields = Array.from(new Set(results.flatMap(obj => Object.keys(obj))))
            .filter(key => !primaryFields.includes(key));
        
        // Set up CSV parser options with field order
        const csvOptions = {
            header: true,
            fields: [...primaryFields, ...otherFields]
        };
        
        // Convert to CSV with ordered fields
        const csv = parse(results, csvOptions);
        
        // Create output directory if it doesn't exist
        const outputDir = './output';
        await fs.mkdir(outputDir, { recursive: true });
        
        // Save to file with locale and timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const filename = path.join(outputDir, `${locale}_schema_data_${timestamp}.csv`);
        await fs.writeFile(filename, csv);
        
        console.log(`Successfully saved data to ${filename}`);
        
        // Log summary
        const sitesWithSchema = results.filter(r => r.schemaFound).length;
        const sitesWithoutSchema = results.filter(r => !r.schemaFound).length;
        console.log('\nSummary:');
        console.log(`Total URLs processed: ${results.length}`);
        console.log(`URLs with schema: ${sitesWithSchema}`);
        console.log(`URLs without schema: ${sitesWithoutSchema}`);
    } catch (error) {
        console.error('Error in main process:', error);
        process.exit(1);
    }
}

main();