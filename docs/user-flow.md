User flow expected:
- expected the user has logged in to the instagram                          
- for hashtag crawler, user open url: https://www.instagram.com/explore/search/keyword/?q=%23{hashtag}
- then the extension will listen to xhr response.
- user scroll down, this will trigger to load more posts.                   
- the extension will save the posts data in csv format.                     
- the csv file will be expartable to csv file