'use strict'

const Homey = require('homey')

class RadiationDriver extends Homey.Driver {
  onInit() {
    console.log('RadiationDriver initialised..............................')
    console.log('Starting Aranet Radiation synchronization sequence..............')
    setTimeout(() => this.synchroniseSensorData(), 1000)
  }

  onPairListDevices() {
    console.log('\nDiscovering new devices................................')

    return this.homey.app
      .discoverDevices('\u2622') // ☢
      .then(devices => {
        console.log('Devices found: ', devices)
        return devices
      })
      .catch(error => {
        console.log('Cannot get devices: ' + error)
        return []
      })
  }

  synchroniseSensorData() {
    if (this.syncInProgress == null) {
      this.syncInProgress = true
      this.syncTimeout = null

      try {
        let devices = this.getDevices()
        this.allUnavailable = true

        if (devices.length > 0) {
          console.log('\n-----------------Init all device update----------------')
          this.homey.app
            .updateDevices(devices)
            .then(() => {
              devices.forEach(device => {
                if (device.getAvailable() || device.retry != 0) {
                  this.allUnavailable = false
                }
              })
              this.setNewTimeout()

              console.log('-------------------All devices updated-----------------')
            })
            .catch(error => {
              this.setNewTimeout()
              console.log('Error updating devices: ', error)
            })
        } else {
          console.log('No devices to synchronize, Aranet Radiation synchronization sequence stopped')
        }
      } catch (error) {
        this.setNewTimeout()
        console.log('Error updating devices: ', error)
      } finally {
        this.syncInProgress = setTimeout(() => {
          this.syncInProgress = null
        }, 3000)
      }
    } else {
      console.log('\nSimultaneous synchroniseSensorData() call prevented\n')
    }
  }

  setNewTimeout() {
    let checkInterval = this.homey.app.manifest.aranet4homey_data.timeout.regular
    if (this.allUnavailable) {
      checkInterval = this.homey.app.manifest.aranet4homey_data.timeout.long
      console.log(
        'No connection to any Aranet Radiation devices, checkup timeout set to ' + checkInterval / 1000 + ' s',
      )
    }
    this.syncTimeout = setTimeout(this.synchroniseSensorData.bind(this), checkInterval)
  }
}

module.exports = RadiationDriver
