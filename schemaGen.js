const OpenAI = require('openai');

// Initialize OpenAI client
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

async function optimizeSchema(schema) {
    try {
        const prompt = `
            Analyze and optimize this schema.org JSON-LD schema:
            ${JSON.stringify(schema, null, 2)}
            
            Return only the optimized JSON-LD schema with:
            1. All required properties for this type
            2. Most relevant recommended properties
            3. Proper nesting and relationships
            4. Valid schema.org vocabulary
        `;

        const completion = await openai.chat.completions.create({
            model: "gpt-4",
            messages: [{
                role: "user",
                content: prompt
            }],
            temperature: 0.2,
        });

        const optimizedSchema = JSON.parse(completion.choices[0].message.content);
        return optimizedSchema;
    } catch (error) {
        console.error('Schema optimization failed:', error);
        return schema; // Return original if optimization fails
    }
}

// Modify the crawlSites function to include optimization
async function crawlSites(sites) {
    const resultsByType = new Map();
    
    for (const site of sites) {
        try {
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
            
            for (let i = 0; i < schemaScripts.length; i++) {
                try {
                    const schema = JSON.parse($(schemaScripts[i]).html());
                    const optimizedSchema = await optimizeSchema(schema);
                    const schemaType = getSchemaType(optimizedSchema);
                    
                    addToResults(resultsByType, schemaType, {
                        sourceUrl: site,
                        schemaFound: true,
                        errorMessage: '',
                        originalSchema: schema,
                        optimizedSchema: optimizedSchema,
                        ...flattenObject(optimizedSchema)
                    });
                } catch (error) {
                    addToResults(resultsByType, 'ParseError', {
                        sourceUrl: site,
                        schemaFound: false,
                        errorMessage: `Error: ${error.message}`
                    });
                }
            }
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