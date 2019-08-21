# Aranet4

## Introduction 

![Aranet4](https://raw.githubusercontent.com/SAF-Tehnika-Developer/com.aranet4/7088134f7607eb22f33380a44a33c9ec38274904/assets/images/aranet4homey.jpg)

Homey Aranet4 app adds support for Aranet4 devices into Homey.

This app is only used to read data and create flows for Aranet4. 
To make configuration changes to your Aranet4 device please download the Aranet4 mobile app.

##### Download the Aranet4 mobile app:

[![](https://raw.githubusercontent.com/SAF-Tehnika-Developer/com.aranet4/7088134f7607eb22f33380a44a33c9ec38274904/assets/images/androidstore.png)](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en)
[![](https://raw.githubusercontent.com/SAF-Tehnika-Developer/com.aranet4/7088134f7607eb22f33380a44a33c9ec38274904/assets/images/applestore.png)](https://apps.apple.com/lv/app/aranet4/id1392378465)

##### More info about Aranet4 on our website: 

> ## **[ARANET4.COM](https://aranet4.com/)**

## Features 

* Read and display data about air quality in your home from Aranet4
  * CO2 particle concentration
  * Temperature
  * Humidity
  * Atmospheric pressure
* Display graphs about air quality changes over time
* Create flows to induce some action when the air quality is decreasing

## FAQ

> Q: Is my Homey compatible with the app? 
> - 
> A: If your Homey has at least version v2.1.2 the app is compatible with your Homey. You can check the version with your Homey app: **Settings → General → Homey version**

> Q: What devices can I add with the app?
> - 
> A: The Homey Aranet4 app supports Aranet4 HOME and Aranet4 PRO. Learn more about Aranet4 **[>> here <<](https://aranet4.com/)**

> Q: Can I add multiple Aranet4 devices to my Homey?
> - 
> A: Yes! There is no set limit to how many Aranet4 you can add to your Homey. You can put them in different parts of your home and monitor the air quality throughout the house.

> Q: Is my Aranet4 compatible with the app?
> - 
> A: If your Aranet4 has firmware version of at least v0.3.0 it is compatible with the app. You can update the firmware with the Aranet4 mobile app: \[ [iOS](https://apps.apple.com/lv/app/aranet4/id1392378465) \] \[ [Android](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en) \]

> Q: What languages does the app support?
> - 
> A: Currently the app supports English, but other languages may be added in future updates.

> Q: Why Homey cannot find any Aranet4 devices? 
> - 
> A: Make sure that your Aranet4 is within close distance to Homey and there are no walls between them. Try adding the Aranet4 at least several times, because Homey might not find the device at the first try.

> Q: I added an Aranet4 device but it is not displaying any measurements.
> - 
> A: This can happen due to following reasons:
> * Device is out of range.
> * Homey integration is disabled. Use the Aranet4 mobile app to enable Homey integration in settings.  \[ [iOS](https://apps.apple.com/lv/app/aranet4/id1392378465) \] \[ [Android](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en) \]
> * Outdated firmware version. Use the Aranet4 mobile app to update the firmware.  \[ [iOS](https://apps.apple.com/lv/app/aranet4/id1392378465) \] \[ [Android](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en) \]
> * Another device is connected to the Aranet4 via bluetooth. Aranet4 should only be connected to Homey and Aranet4 mobile app.

> Q: Why my Aranet4 sensor values stopped updating? 
> - 
> A: This can happen due to following reasons:
> * Device is out of range.
> * Homey integration is disabled. Use the Aranet4 mobile app to enable Homey integration in settings.  \[ [iOS](https://apps.apple.com/lv/app/aranet4/id1392378465) \] \[ [Android](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en) \]
> * Another device is connected to the Aranet4 via bluetooth. Aranet4 should only be connected to Homey and Aranet4 mobile app.


> Q: What is the operation range between Aranet4 and Homey?
> - 
> A: Up to 10m in normal mode and up to 20m in extended bluetooth range mode. You can set the bluetooth range with the Aranet4 mobile app: \[ [iOS](https://apps.apple.com/lv/app/aranet4/id1392378465) \] \[ [Android](https://play.google.com/store/apps/details?id=com.saf.aranetCube.android&hl=en) \]

## Instructions 

To use Aranet4 app with your Homey please follow these instructions:

1. Download the Aranet4 app for Homey
1. Open your Homey app
1. Go to **Devices → "✚"** on top right **→ Aranet4 → Aranet4 → Install**
1. Select the devices you want to add and press **Next**.
    * If your device was not found, please try adding at least several more times
1. Wait up to 5 minutes for your device to initialize. Usually this takes less than a minute.
    * If your device is still unavailable after that time, make sure your Aranet4 has Homey integration enabled in settings and latest firmware installed via Aranet4 mobile app.

## Changelog

### v1.0.0

* First version of the app added to the store.

## Contacts 

If you encounter any problems with the app that cannot be solved with the FAQ provided please contact us via e-mail at: 
> ## app@saftehnika.com
