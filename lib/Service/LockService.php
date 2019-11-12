<?php declare(strict_types=1);


/**
 * Files_Lock - Temporary Files Lock
 *
 * This file is licensed under the Affero General Public License version 3 or
 * later. See the COPYING file.
 *
 * @author Maxence Lange <maxence@artificial-owl.com>
 * @copyright 2019
 * @license GNU AGPL version 3 or any later version
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 */


namespace OCA\FilesLock\Service;


use daita\MySmallPhpTools\Traits\TStringTools;
use Exception;
use OCA\FilesLock\Db\LocksRequest;
use OCA\FilesLock\Exceptions\AlreadyLockedException;
use OCA\FilesLock\Exceptions\LockNotFoundException;
use OCA\FilesLock\Exceptions\NotFileException;
use OCA\FilesLock\Exceptions\UnauthorizedUnlockException;
use OCA\FilesLock\Model\FileLock;
use OCP\Files\InvalidPathException;
use OCP\Files\Node;
use OCP\Files\NotFoundException;
use OCP\IUser;


/**
 * Class LockService
 *
 * @package OCA\FilesLock\Service
 */
class LockService {


	const PREFIX = 'files_lock';


	use TStringTools;


	/** @var LocksRequest */
	private $locksRequest;

	/** @var FileService */
	private $fileService;

	/** @var ConfigService */
	private $configService;

	/** @var MiscService */
	private $miscService;


	public function __construct(
		LocksRequest $locksRequest, FileService $fileService, ConfigService $configService,
		MiscService $miscService
	) {
		$this->locksRequest = $locksRequest;
		$this->fileService = $fileService;
		$this->configService = $configService;
		$this->miscService = $miscService;
	}


	/**
	 * @param FileLock $lock
	 *
	 * @throws AlreadyLockedException
	 */
	public function lock(FileLock $lock) {
		$this->generateToken($lock);
		try {
			$known = $this->locksRequest->getFromFileId($lock->getFileId());

			throw new AlreadyLockedException('File is already locked by ' . $known->getUserId());
		} catch (LockNotFoundException $e) {
			$this->locksRequest->save($lock);
		}
	}


	/**
	 * @param Node $file
	 * @param IUser $user
	 *
	 * @return FileLock
	 * @throws AlreadyLockedException
	 * @throws InvalidPathException
	 * @throws NotFileException
	 * @throws NotFoundException
	 */
	public function lockFile(Node $file, IUser $user): FileLock {
		if ($file->getType() !== Node::TYPE_FILE) {
			throw new NotFileException('Must be a file, seems to be a folder.');
		}

		$lock = new FileLock();
		$lock->setUserId($user->getUID());
		$lock->setFileId($file->getId());

		$this->lock($lock);

		return $lock;
	}


	/**
	 * @param FileLock $lock
	 * @param bool $force
	 *
	 * @throws LockNotFoundException
	 * @throws UnauthorizedUnlockException
	 */
	public function unlock(FileLock $lock, bool $force = false) {
		$known = $this->locksRequest->getFromFileId($lock->getFileId());

		if (!$force && $known->getUserId() !== $known->getUserId()) {
			throw new UnauthorizedUnlockException();
		}

		$this->locksRequest->delete($known);
	}


	/**
	 * @param int $fileId
	 * @param string $userId
	 *
	 * @param bool $force
	 *
	 * @return FileLock
	 * @throws LockNotFoundException
	 * @throws UnauthorizedUnlockException
	 */
	public function unlockFile(int $fileId, string $userId, bool $force = false): FileLock {
		$lock = new FileLock();
		$lock->setUserId($userId);
		$lock->setFileId($fileId);

		$this->unlock($lock, $force);

		return $lock;
	}


	/**
	 * @return FileLock[]
	 */
	public function getDeprecatedLocks(): array {
		$timeout = (int)$this->configService->getAppValue(ConfigService::LOCK_TIMEOUT);
		if ($timeout === 0) {
			$timeout = $this->configService->defaults[ConfigService::LOCK_TIMEOUT];
			$this->miscService->log(
				'ConfigService::LOCK_TIMEOUT is not numerical, using default (' . $timeout . ')', 1
			);
		}

		try {
			$locks = $this->locksRequest->getLocksOlderThan($timeout);
		} catch (Exception $e) {
			return [];
		}

		return $locks;
	}


	/**
	 * @param int $fileId
	 *
	 * @return FileLock
	 * @throws LockNotFoundException
	 */
	public function getLockFromFileId(int $fileId): FileLock {
		return $this->locksRequest->getFromFileId($fileId);
	}


	/**
	 * @param string $path
	 *
	 * @return bool
	 * @throws InvalidPathException
	 */
	public function isPathLocked(string $path): bool {
		try {
			$file = $this->fileService->getFileFromPath($path);

			return $this->isFileLocked($file->getId());
		} catch (NotFoundException $e) {
		}

		return false;
	}

	/**
	 * @param int $fileId
	 *
	 * @return bool
	 */
	public function isFileLocked(int $fileId): bool {
		try {
			$this->getLockFromFileId($fileId);

			return true;
		} catch (LockNotFoundException $e) {
			return false;
		}
	}


	/**
	 * @param FileLock $lock
	 */
	public function generateToken(FileLock $lock) {
		if ($lock->getToken() !== '') {
			return;
		}

		$lock->setToken(self::PREFIX . '-' . $this->uuid());
	}


	/**
	 * @param FileLock[] $locks
	 */
	public function removeLocks(array $locks) {
		$ids = array_map(
			function(FileLock $lock) {
				return $lock->getId();
			}, $locks
		);

		$this->locksRequest->removeIds($ids);
	}

}
