'use strict';

const Homey = require('homey');

const DATA_SERVICE_UUID = Homey.manifest.aranet4homey_data.data_service_uuid;
const DATA_CHARACTERISTIC_UUID = Homey.manifest.aranet4homey_data.data_characteristic_uuid;
const MAX_RETRIES = Homey.manifest.aranet4homey_data.max_retries;

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}

class Aranet4Homey extends Homey.App {

	onInit() {
		console.log('\nAranet4Homey is running................................');
	}

	discoverDevices(driver) {
		return new Promise((resolve, reject) => {
			try {
				this.searchDevices(driver).then((devices) => {
					if (devices.length > 0) {
						resolve(devices);
					}
					else {
						reject();
					}
				});
			} catch (exception) {
				reject(exception);
			}
		});
	}

	discoverAdvertisements() {
		return new Promise((resolve, reject) => {
			Homey.ManagerBLE.discover([DATA_SERVICE_UUID], 5000).then(function (advertisements) {				
				resolve(advertisements);
			}).catch(error => {
				reject(error);
			});
		});
	}

	searchDevices(driver) {
		return new Promise((resolve, reject) => {
			let devices = [];

			const promise = this.discoverAdvertisements();

			promise.then((advertisements) => {
				if (advertisements.length === 0) {
					resolve([]);
				}

				advertisements.forEach(function (advertisement) {
					if (advertisement.localName !== undefined) {
						devices.push({
							"name": advertisement.localName,
							"data": {
								"id": advertisement.id,
								"uuid": advertisement.uuid,
								"address": advertisement.uuid,
								"name": advertisement.localName
							},
						});
					}
				});

				resolve(devices);
			}).catch((error) => {
				reject(error);
			});
		});
	}
	
	async findDevice(device) {
		return await Homey.ManagerBLE.discover([DATA_SERVICE_UUID], 5000).then(function (advertisements) {
			let advertisement = advertisements.find(advertisement => advertisement.uuid == device.getData().uuid);
			if (typeof advertisement === 'undefined'){
				return null;
			} else {
				return advertisement;
			}
		});
	}

	async checkup(device){
		
		let name = device.getData().name;
		let timenow = new Date().getTime();
		console.log('Attempting to refresh ' + name);

		let disconnectPeripheral = async () => {
			console.log('disconnectPeripheral not registered yet');
		};

		if(timenow >= device.nextcheckuptime) {
			if(device.retry >= MAX_RETRIES){
				if(device.getSettings().connection == true && device.lost_conn == false){
					let text = Homey.__("notifications.connection.lost", { "device": name });
					let connTimeout = new Homey.Notification({excerpt: text});
					connTimeout.register();
				}
				device.lost_conn = true;
				device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long;
				device.retry = 0;
				await device.setUnavailable(Homey.__("notifications.app.no_connection", { "device": name }));
				console.log('Connection failed after ' + MAX_RETRIES + ' retries, next checkup set after ' + this.manifest.aranet4homey_data.timeout.long + ' ms');
				return device;
			}

			try {
				console.log("---------Refresh sensor data for " + name + "---------" + " (attempt " + (device.retry+1) + "/" + MAX_RETRIES + ")");

				let advertisement = await this.findDevice(device);	
				if (!advertisement) {
					device.retry += 1;
					console.log('Missing advertisement: ' + name);
					return device;	
				}

				console.log('Attemtping to connect: ' + name);	
				device.peripheral = await advertisement.connect();

				disconnectPeripheral = async () => {
					try {
						console.log('Attempting to disconnect ' + name + ' peripheral');
						if (device.peripheral.isConnected) {
							return await device.peripheral.disconnect();
						}
					} catch (err) {
						console.log('Error disconnecting peripheral for ' + name + ': ' + err);
					}
				};				

				let services = await device.peripheral.discoverServices();

				let service = await services.find(service => service.uuid === DATA_SERVICE_UUID);
				if (!service) {
					device.retry = 0;
					device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long;
					await device.setUnavailable(Homey.__("notifications.app.common_error", { "device": name }));
					console.log('Missing data service: ' + name);
					await disconnectPeripheral();
					return device;	
				}
				let characteristics = await service.discoverCharacteristics();

				console.log('Getting sensor data: ' + name);
				let data = await characteristics.find(characteristic => characteristic.uuid === DATA_CHARACTERISTIC_UUID);
				if(!data) {
					device.retry = 0;
					device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long;
					await device.setUnavailable(Homey.__("notifications.app.common_error", { "device": name }));
					console.log('Missing data characteristic');
					await disconnectPeripheral();
					return device;
				}
				let sensorData = await data.read();
				console.log("Sensor data: ", sensorData);

				if(!sensorData.length){
					device.retry = 0;
					device.nextcheckuptime = timenow + this.manifest.aranet4homey_data.timeout.long;
					await device.setUnavailable(Homey.__("notifications.app.common_error", { "device": name }));
					console.log("Refresh canceled for " + name + ": Homey integration is disabled or calibration in progress");
					await disconnectPeripheral();
					return device;
				}

				let sensorValues = {
					"measure_co2": sensorData.readUInt16LE(0),
					"measure_temperature": sensorData.readUInt16LE(2)/20,
					"measure_pressure": sensorData.readUInt16LE(4)/10,
					"measure_humidity": sensorData.readUInt8(6),
					"measure_battery": sensorData.readUInt8(7),
					"alarm_battery": (sensorData.readUInt8(7) < this.manifest.aranet4homey_data.battery_alarm_trigger),
				};

				if(sensorValues.alarm_battery == true && device.alarm_battery_triggered == false){
					device.alarm_battery_triggered = true;
					let text = Homey.__("notifications.app.low_battery", { "device": name });
					let batteryNotification = new Homey.Notification({excerpt: text});
					batteryNotification.register();
				}
				else if(sensorValues.alarm_battery == false && device.alarm_battery_triggered == true && sensorValues.measure_battery >= this.manifest.aranet4homey_data.battery_alarm_trigger + 10){
					device.alarm_battery_triggered = false;
				}

				let interval = sensorData.readUInt16LE(9);
				let passed = sensorData.readUInt16LE(11);
				if(interval > passed){
					let remaining = 10+interval-passed;
					device.nextcheckuptime = new Date().getTime() + remaining*1000;
					console.log("Remaining time to refresh " + name + ": " + remaining + "s");
				} 

				await asyncForEach(device.getCapabilities(), async (characteristic) => {
					if (sensorValues.hasOwnProperty(characteristic)) {
						device.setCapabilityValue(characteristic, sensorValues[characteristic]);
					}
				});
				console.log("Updated sensor data: \n", sensorValues);
				
				await disconnectPeripheral();
				console.log('Disconnected ' + name + ' peripheral');

				if(device.lost_conn == true){
					device.lost_conn = false;
					if(device.getSettings().connection == true){
						let text = Homey.__("notifications.connection.secured", { "device": name });
						let connSecured = new Homey.Notification({excerpt: text});
						connSecured.register();
					}
				}

				device.retry = 0;
				await device.setAvailable();
				console.log('Refresh completed for: ' + name);
				
				return device;
			}
			catch (err) {
				device.retry += 1;
				await disconnectPeripheral();
				console.log("Refresh error: " + err);
				return device;
			}
		}
		else
		{
			console.log("---Refresh sensor data for " + name + " (postphoned)--");
			console.log("Remaining time to next refresh " + name + ": " + ~~((device.nextcheckuptime-timenow)/1000) + "s");
			return device;
		}
	}

	async updateDevice(device) {
		return await this.checkup(device);
	}

	async updateDevices(devices) {
		return await devices.reduce((promise, device) => {
			return promise
			.then(() => {
				return this.updateDevice(device)
				.catch((error) => {
					console.log(error);
				});
			}).catch(error => {
				console.log(error);
			});
		}, Promise.resolve());
	}

}

module.exports = Aranet4Homey;