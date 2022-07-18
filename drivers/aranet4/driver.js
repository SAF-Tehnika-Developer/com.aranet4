'use strict';

const Homey = require('homey');

class Aranet4Driver extends Homey.Driver {

	onInit() {
    console.log('Aranet4Driver initialised..............................');
    console.log('Starting Aranet4 synchronization sequence..............');
    this.synchroniseSensorData();
  }
  
  onPairListDevices( data, callback ) {
    console.log('\nDiscovering new devices................................');
    Homey.app.discoverDevices(this)
      .then(devices => {
        console.log('\n-------------------onPairListDevices-------------------');
        console.log('Devices found: ', devices);
        callback(null, devices);
      })
      .catch(error => {
        console.log('Cannot get devices: ' + error);
        callback(null, []);
      });
  }

  synchroniseSensorData() {
    if(this.syncInProgress == null){
      this.syncInProgress = true;
      this.syncTimeout = null;

      try {
        let devices = this.getDevices();
        this.allUnavailable = true;

        if(devices.length > 0){
          console.log('\n-----------------Init all device update----------------');
          Homey.app.updateDevices(devices)
            .then(() => {
              devices.forEach(device => {
                if(device.getAvailable() || device.retry != 0){
                  this.allUnavailable = false;
                }
              });
              this.setNewTimeout();
              
              console.log('-------------------All devices updated-----------------');
            })
            .catch(error => {
              this.setNewTimeout();
              console.log('Error updating devices: ', error);
            });
        }
        else{
          console.log('No devices to synchronize, Aranet4 synchronization sequence stopped');
        }
      } catch (error) {
        this.setNewTimeout();
        console.log('Error updating devices: ', error);
      } finally {
        this.syncInProgress = setTimeout( () => {
          this.syncInProgress = null;
        }, 3000);
      }
    }else{
      console.log('\nSimultaneous synchroniseSensorData() call prevented\n');
    }
  }

  setNewTimeout() {
    let checkInterval = Homey.app.manifest.aranet4homey_data.timeout.regular;
    if(this.allUnavailable){  
      checkInterval = Homey.app.manifest.aranet4homey_data.timeout.long;
      console.log("No connection to any Aranet4 devices, checkup timeout set to " + checkInterval/1000 + " s");
    }
    this.syncTimeout = setTimeout(this.synchroniseSensorData.bind(this), checkInterval);
  }
}

module.exports = Aranet4Driver;