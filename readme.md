# Schema Site Crawler 

Description: Crawl sites for schema and return a csv file of current schema found



## To Run
1) Create an array of urls in a file inside of a folder titled "sites-urls", the file must be named with a local ie. nl-be-urls.js
    #### Example:
    ``` 
    // nl-be-urls.js
    module.exports = [
        'https://example-nl-be.com',
        'https://another-nl-be-site.com',
        // Add more URLs here
    ];
    ```
2) Run `node index.js nl-be` (where "nl-be" relates to your url file)
3) View results in output folder