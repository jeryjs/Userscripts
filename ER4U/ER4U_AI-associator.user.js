// ==UserScript==
// @name        ER4U - AI Associator
// @namespace   https://github.com/jeryjs
// @version     0.0.1
// @description Automatically generate associations and description for each product smartly using Gemini AI
// @icon        https://er4uenterpriseplus.in/er4u/jeshmargin/img/f.jpg
// @author      Jery
// @license     MIT
// @match       https://er4uenterpriseplus.in/er4u/jeshmargin/combination_list.php
// @match       https://er4uenterpriseplus.in/er4u/jeshmargin/catalog_category_map.php?&comid=*
// @require     https://unpkg.com/axios/dist/axios.min.js
// @grant       GM_getValue
// @grant       GM_setValue
// @run-at      document-end
// ==/UserScript==

/************************
 * SETTINGS
 ************************/
const aiServiceId = 0;
const imageServiceId = 0;

/***************************************************************
 * Helper sub-script to set association in a new tab
 ***************************************************************/
if (window.location.href.includes("catalog_category_map.php?&comid=")) {

    const associations = GM_getValue("associations") || [];

    const assocId = "assoc_" + (new URLSearchParams(document.location.search)).get("comid");
    const association = associations.find(assoc => assoc.id === assocId);

    if (association) {
        setCategories(association.categories);
        setInformation(association.shortDesc, association.longDesc);
        setImageLink(association.images);
        // click save button
        setTimeout(() => {
            document.querySelector("#cForm button.btn-save-1").click();
        }, 1000);
    }

    function setCategories(categories) {
        // goto category tab
        document.querySelector("#nav-profile-tab").click();
        categories.forEach((cat, _) => {
            // add category
            document.querySelector("#tab_tab > tbody").lastElementChild.querySelector('input').value = cat;
            // click plus button
            document.querySelector("#add_row").click();
        });
    }

    function setInformation(shortDesc, longDesc) {
        // goto information tab
        document.querySelector("#nav-home-tab").click();
        document.querySelector("#cke_short_description").querySelector("iframe").contentDocument.querySelector("body").textContent = shortDesc;
        document.querySelector("#cke_full_description").querySelector("iframe").contentDocument.querySelector("body").textContent = longDesc;
    }

    function setImageLink(images) {
        // goto img url tab
        document.querySelector("#nav-img-url-tab").click();
        images.forEach((img, _) => {
            // add img url
            document.querySelector("#tab_tab > tbody").lastElementChild.querySelector('input').value = img.getCleanedImageLink();
            // click plus button
            document.querySelector("#add_row").click();
        });
    }
}


/***************************************************************
 * Initialize all buttons
 ***************************************************************/
if (window.location.href.includes("combination_list.php")) {
    const generateBtnArea = document.querySelector("thead:nth-child(1) > tr");
    
    // Associate Images Button
    const associateBtn = document.createElement("a");
    associateBtn.textContent = "Associate Images (with AI)";
    associateBtn.classList.add("text-primary");
    associateBtn.style = "color: white; cursor: pointer;";
    associateBtn.addEventListener("click", () => displayForm());
    generateBtnArea.appendChild(document.createElement("td")).appendChild(associateBtn);
    // generateBtnArea.innerHTML += `<td><a id="ClearZeroQtyBtn" style="color: white; cursor: pointer;">Clear 0 Qty</a></td>`;

    // Clear 0 qty Button
    const clearZeroQtyBtn = document.createElement("a");
    clearZeroQtyBtn.textContent = "Clear 0 Qty";
    clearZeroQtyBtn.classList.add("text-primary");
    clearZeroQtyBtn.style = "color: white; cursor: pointer;";
    clearZeroQtyBtn.addEventListener("click", () => {
        console.log("Clearing 0 Qty");
        const zeroQtyRows = document.querySelectorAll(`#item-list td:nth-child(31)`);
        zeroQtyRows.forEach((row) => {
            if (row.textContent.trim() == "0") row.parentElement.remove();
        });
    });
    generateBtnArea.appendChild(document.createElement("td")).appendChild(clearZeroQtyBtn);
}

/***************************************************************
 * Classes for handling various data like settings, products,
 * services and websites
 ***************************************************************/
class Product {
	constructor(id, name, brand, mrp, barcode, hasImage) {
		this.id = id;
		this.name = name;
		this.brand = brand;
        this.mrp = mrp;
		this.barcode = barcode;
        this.hasImage = hasImage;
	}
}

class ProductList {
	constructor() {
		this.products = [];
	}

	addProduct(product) {
		this.products.push(product);
	}

    extractProducts() {
        const productRows = document.querySelectorAll("#item-list > tr:not(:last-child)");
        productRows.forEach((row) => {
            const id = row.querySelector(".cus_edit").href.split("comid=")[1];
            const name = row.querySelector("td:nth-child(6)").textContent;
            const brand = row.querySelector("td:nth-child(8)").textContent;
            const mrp = row.querySelector("td:nth-child(20)").textContent;
            const barcode = row.querySelector("td:nth-child(4)").textContent;
            const hasImage = row.querySelector("td:nth-child(32) > a").textContent.trim() == "Y" ? true : false;
            this.addProduct(new Product(id, name, brand, mrp, barcode, hasImage));
        });
        return this.products;
    }
}

class Association {
    constructor(id, categories, shortDesc, longDesc, images, confidence) {
        this.id = id;
        this.categories = categories;
        this.shortDesc = shortDesc;
        this.longDesc = longDesc;
        this.images = images;
        this.confidence = confidence;
    }

    static fromJSON(json, imagelist) {
        const { id, categories, shortDesc, longDesc, images, confidence } = JSON.parse(json);
        return new Association(id, categories, shortDesc, longDesc, images.filter((_, i) => imagelist.includes(i)), confidence);
    }
}

class Image {
	constructor(title, original, thumbnail) {
        this.title = title;
		this.original = original;
		this.thumbnail = thumbnail;
	}

    async base64Thumbnail() {
        const response = await api.get(this.thumbnail, { responseType: 'arraybuffer' });
        const binary = String.fromCharCode(...new Uint8Array(response.data));
        return btoa(binary);
    }

    async toGenerativePart(mimeType="image/jpeg") {
        return {
            inline_data: {
                data: await this.base64Thumbnail(),
                mime_type: mimeType,
            },
        };
    }

    getCleanedImageLink = () => /\.(jpeg|jpg|png)$/.test(this.original.replace(/(\.jpeg|\.jpg|\.png).*/, '$1')) ? this.original.replace(/(\.jpeg|\.jpg|\.png).*/, '$1') : '';
}

class Api {
  constructor() {
    this.cacheDuration = 0; // Cache duration set to infinite
  }

  async request(config) {
    const cacheKey = `cache_${JSON.stringify(config)}`;
    const cachedData = GM_getValue(cacheKey);

    if (cachedData) {
      const { timestamp, response } = cachedData;
      const now = new Date().getTime();

      if (now - timestamp < this.cacheDuration) {
        return response;
      }
    }

    const response = await axios(config);

    if (response.status >= 200 && response.status < 600) {
      GM_setValue(cacheKey, { timestamp: new Date().getTime(), response });
    }

    return response;
  }

  get(url, config = {}) {
    return this.request({ ...config, method: "get", url });
  }

  post(url, data, config = {}) {
    return this.request({ ...config, method: "post", url, data });
  }
}

const AIServices = [
    {
        name: "Gemini",
        icon: "https://gemini.com/favicon.ico",
        url: "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?alt=sse&key=",
        async generateAssociation(product, imagelist) {
            var apiKey = localStorage.getItem("gemini_api_key");
    
            while (!apiKey || apiKey.length <= 30 || apiKey.trim() === "") {
                const userInput = prompt("Please enter your Gemini API key:");
                if (userInput && userInput.length > 30 && userInput.trim() !== "") {
                    localStorage.setItem("gemini_api_key", userInput.trim());
                    apiKey = userInput.trim();
                } else {
                    alert("Invalid Gemini API Key");
                }
            }
    
            let prompt = `Id: ${product.id}\nProduct: ${product.name}\nBrand: ${product.brand}\nMRP: ${product.mrp}\nImages:\n`;
            const parts = [{ text: prompt }];
    
            for (const image of imagelist) {
                const imagePart = await image.toGenerativePart();
                parts.push(imagePart);
            }
    
            const requestBody = {
                system_instruction: {parts: {text: "You are a product associator for Jesh Supermarket's online webstore.\nWe wanna set up a online web store, but dont wanna go through the hassle of manually setting up all the images and details and categories... So we want u to smartly do it for us.\nYou will be given a product with some information like its mrp (in rupees) and the name along with some images.\nYour job is to smartly analyse the given data and use circumstantial evidence, intuition and guesswork to respond in json with the following data (u can directly start with the {} and dont need to put the blockquotes or mention lang)-\n{\n    \"id\": integer (provided in the input),\n    \"categories\": int array (starts from index = 0) (okay, so this requires a lot of thought kay... add all the right 'ids' of categories (categories is provided below). Like suppose product is milk, then the response should be `[28, 84]`. try to match as many categories as possible, ACCURATELY!!),\n\t\"shortDesc\": string (around 50-200 characters, describing the product in a confident, straightforward manner (this is gonna be displayed to customer in search page.)),\n\t\"longDesc\": string (around 300-700 characters, describing the product confidently, straightforward and generic in a well formatted manner (only pure text, no markdown or html)),\n\t\"images\": int array (starts from index = 0) (you will be provided some images that were scraped from google... Whether this is the right image or not is unknown, so what u are gonna have to do is study all the images and decide whether they are the right fit for this product, considering the product details such as name, price (in rupees), quantity, flavor, etc. like `[1, 4]`. For example, if the product is a blue geometry box from Natraj, then from the images, compare and select whichever is the closes match. In case all the images are weird, then at least try to match with whichever ones are the closest (even if not natraj or blue. But this applies only to situation where all other images are completely irrelevant.). In case no good images, then just return empty array like `[]`. For abstract products like \"bangles\", since the image is important, but u dont kknow what it looks like, always leave blank.),\n\t\"confidence\": float (0 to 1) (how sure are you of the images and ur knowledge of this specific product? for example, for a biscuit like parle-g, u might have high confidence since its common knowledge, but for a product like a snacks box, u might have low confidence since u dont know what the ACTUAL physical product looks like.)\n}\n\ncategories:= {\"Breakfast&Dairy\":{ \"MilkProduct\":28, \"Bread\":29, \"Paneer\":30, \"Butter&Cheese\":31, \"James,Honey\":32 },\"Beverages\":{ \"ColdDrinks\":23, \"Juices&Drinks\":24, \"Tea&Coffee\":25, \"Health&EnergyDrinks\":26, \"Water&Soda\":27, \"MilkDrinks\":52 },\"HouseholdNeeds\":{ \"Detergents&Dishwash\":40, \"Cleaners\":41, \"Freshener&Repellents\":42, \"Mops,Brushes&Scrubs\":43 },\"Biscuiits,Snacks&Chocolate\":{ \"Biscuits&Cookies\":33, \"Namkeen&Snacks\":34, \"Chips&Crisps\":35, \"Chocolates&Candies\":36, \"Sweets\":37 },\"PersonalCare\":{\"Bath&Body\":49,\"HairCare\":50,\"SkinCare\":53,\"OralCare\":54,\"Deos&Perfumes\":55,\"FaceCare\":56,\"FeminineHygiene\":57,\"Cosmetics\":{ \"Sachets\":62 },\"Toothpastes\":81,\"BathSoap\":{ \"Facewash\":100 },\"Oils\":90,\"Sanitaries\":94,\"FacePowder\":102,\"Dishwashingitems\":112,\"Soappowders\":113},\"Home&Kitchen\":{ \"Cookware\":45, \"Storage&Containers\":46, \"KitchenTools&Accessories\":47, \"Bags&TravelAccessories\":48 },\"ChocalateItems\":60,\"HouseholdEssentials\":63,\"Stationaries\":{ \"Tools\":65, \"TailaringItems\":66, \"Fancyitems\":95, \"Coveringitems\":103, \"NoteBooks\":108, \"HomeDecor\":110 },\"Groceries\":{\"Teapowder\":70,\"MilkProducts\":84,\"Spices&Seasonings\":85,\"FastFood\":88,\"CookingOil\":93,\"Oils\":96,\"Condiments\":97,\"Flours\":98, \"Rice&Salt\":99,\"Products\":101,\"Egg\":111},\"Consumables\":{ \"Sweets\":69, \"HealthSupplements\":73, \"Drinks\":74, \"Biscuits\":77, \"Bakery\":78 },\"PoojaItems\":71,\"Xeroxcharges\":72,\"BirthdayItems\":80,\"ElactricalItems\":83,\"KicthenEssentials\":87,\"AnimalsFoods\":89, \"BabyProducts\":91,\"PlasticItems\":92,\"SteelItems\":105,\"Glassproducts\":106,\"Footwear\":107,\"Offeritems\":109}"}},
                contents: [{ parts }],
                safety_settings: [{category: "HARM_CATEGORY_HARASSMENT",threshold: "BLOCK_NONE"},{category: "HARM_CATEGORY_HATE_SPEECH",threshold: "BLOCK_NONE"},{category: "HARM_CATEGORY_DANGEROUS_CONTENT",threshold: "BLOCK_NONE"}]
            };
            const response = await api.post(this.url + apiKey, requestBody, { headers: {'Content-Type': 'application/json'} });
              
            // const reader = response.body.getReader();
            // const decoder = new TextDecoder('utf-8');
            // let result = '';
              
            // while (true) {
            //     const { done, value } = await reader.read();
            //     if (done) break;
            //     result += decoder.decode(value, { stream: true });
            // }

            const data = JSON.parse(response.data.replace("data:", ""));
            const result = data.candidates[0].content.parts[0].text;
            console.log(result);
    
            const associationData = result.match(/\{.*\}/g)[0];
            return new Association.fromJSON(associationData, imagelist);
        }
    }
];

const ImageServices = [
    {
        name: "Google",
        icon: "https://www.google.com/favicon.ico",
        url: "https://www.googleapis.com/customsearch/v1?",
        async getImages(query) {
            const proxyUrl = "https://test.cors.workers.dev/?";
            const imageList = [];

            if (!localStorage.getItem("googleapi_key")) {
                const promptMessage = "Please enter your Google API key:";
                const userInput = prompt(promptMessage);

                if (userInput.length>10 && userInput.trim() !== "") {
                    localStorage.setItem("googleapi_key", userInput.trim());
                } else {
                    console.error("Invalid Google API Key");
                }
            }

            const api_key = localStorage.getItem("googleapi_key");
            const params = `cx=364fea58938af485a&searchType=image&key=${api_key}&q=${query}`;
            const url = this.url + params;
            const response = await api.get(url);

            console.log(response.data);

            const results = response.data['items'];
            console.log(results);
            results.forEach((result) => {
                imageList.push(new Image(
                    title = result["title"],
                    original = result["link"],
                    thumbnail = result["image"]["thumbnailLink"]
                ));
            });

            return imageList;
        },
    }
];

/***************************************************************
 * Functions for working of script
 ***************************************************************/
const api = new Api();

async function displayForm() {
    const products = (new ProductList()).extractProducts();
    console.log(products);
    
    for (const product of products) {
        // const imagelist = await ImageServices[imageServiceId].getImages(products[0].name);
        const imagelist = [(new Image("150g protein in a day","https://i.pinimg.com/originals/06/92/2c/06922c965121901b9ad3ea565a1c9e0d.jpg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRasub-YnSZhWXmaS5sr9rwThTojbKDyTsGWSC6VEIRCEeKjDZ4rqT5uw&s")),(new Image("Cadbury Dairy Milk Milk Chocolate 150g","https://www.cadbury.com.au/media/catalog/product/m/o/mond-9300617063872-1.jpg?quality=80&bg-color=255,255,255&fit=bounds&height=519&width=712&canvas=712:519","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSYrU2XDUEAS4huRJRj0dnKbJxJqZTDg0NCb2cLIR9W68J1_3pdgOQ6Ig&s")),(new Image("Argentina Corned Beef 150g — .","https://primomart.ph/cdn/shop/products/3f904b3ca7f0e7ccbca241d3297e9330_700x700.jpg?v=1597314096","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjP9DVMdpIIWZ1-cwU6-dKT3imIZWuoaowsZSOty_cyaj1rrMDF-ELgzLy&s")),(new Image("150g chicken breast (raw weight), 2 boiled eggs and a medium ...","https://i.redd.it/xpzekgyixoma1.jpg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRe8dPaZ539HOobsYNAFOiscy8grAgxCxv81fBAIK0Rq2o9YqkIxf6hAS0&s")),(new Image("Arla Gouda Slices 150g | Arla","https://www.arla.com.mt/4998e0/globalassets/arla-global/products---overview/all-products-a-z/cheese/mt/arla-gouda-slices-150g.png?preset=product-mobile","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT5KNcQXpzH_H7m5n46gVBiqi66-DdqF37hieMjz7OTe9NlK8VsIvdhg2k&s")),(new Image("Lindt Les Grandes Milk Chocolate Hazelnut Bar 150g","https://www.chocolate.lindt.com/media/catalog/product/6/3/63701f83bdab661e4f87f538d00708546b411ac594d6e3150dff7d76208f8677.jpeg?quality=80&fit=bounds&height=700&width=700&canvas=700:700","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQtp7wfhComTTWYElEP2YJfDAIZTuDl3PbV1fYOpdUZIddLDXkJHZ_PjWZ9&s")),(new Image("Desert Salt 150g Box | Savoursmiths","https://savoursmiths.com/wp-content/uploads/2020/03/Savoursmiths_Products_Dessert_Salt.jpg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSN0iTXHJ4YH3ISFzZLqRuCNXE-of4OKoVXbYz8ZSiLN_mhNpL20V7cnxI&s")),(new Image("Cessna 150G — Above All Aviation","https://images.squarespace-cdn.com/content/v1/544f2a03e4b03cb72fecc09b/1503010958440-C3SR1DLC458OT984BE1W/image-asset.jpeg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcS8TNFhOOjqMrAmvi-1YUUjVg7tkHl7HWGVdDhECc4uq5EcHiIELMsP1FM&s")),(new Image("Marie Biscuits - 150g – Surati Snacks - Buy Indian Snacks & Sweets","https://www.suratiworld.com/cdn/shop/products/Marie144gm_final_800x.jpg?v=1632939103","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQvzuqquPr2Q5V6kWwJ2CC2um9e6iQeJdmRsCRhq83sxKvbS06mqwdnww&s")),(new Image("Argentina Corned Beef 150g - SDC Global Choice","https://sdcglobalchoice.com/wp-content/uploads/2021/07/150g-argentina-corned-beef.jpg","https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT49fV_H1OAq5Ks1THAO2noPXbwPNcVALN_JbtcRzKveOvdiD7K3c6zjgeJ&s"))];
        console.log(imagelist);
        
        const association = await AIServices[aiServiceId].generateAssociation(product, imagelist);
        console.log(association);

        const associations = GM_getValue("associations") || [];
        associations.push(association);
        GM_setValue("associations", associations);
    }
}